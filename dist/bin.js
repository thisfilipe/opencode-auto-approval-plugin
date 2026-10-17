#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import * as z from "zod/mini";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
//#region src/stats.ts
/** Today and the N calendar days before it (0 = today only), a calendar year, or everything. */
function inRange(input) {
	const time = new Date(input.record.time);
	if (Number.isNaN(time.getTime())) return false;
	switch (input.range.kind) {
		case "all": return true;
		case "year": return time.getFullYear() === input.range.year;
		case "days": {
			const start = new Date(input.now);
			start.setHours(0, 0, 0, 0);
			start.setDate(start.getDate() - input.range.days);
			return time >= start;
		}
	}
}
function describeRange(input) {
	switch (input.range.kind) {
		case "all": return "all time";
		case "year": return input.range.year === input.now.getFullYear() ? `${input.range.year} so far` : String(input.range.year);
		case "days":
			if (input.range.days === 0) return "today";
			return input.range.days === 1 ? "today and yesterday" : `today and the ${input.range.days} days before`;
	}
}
function summarize(input) {
	const verdicts = {
		allow: 0,
		deny: 0,
		escalate: 0,
		error: 0,
		oversize: 0
	};
	const groups = /* @__PURE__ */ new Map();
	for (const record of input.records) {
		verdicts[record.verdict] += 1;
		const key = `${record.provider}\u0000${record.model}`;
		const group = groups.get(key);
		if (group === void 0) groups.set(key, [record]);
		else group.push(record);
	}
	const models = [...groups.values()].map((records) => modelStats(records)).toSorted((a, b) => b.reviews - a.reviews);
	return {
		range: describeRange({
			range: input.range,
			now: input.now
		}),
		reviews: input.records.length,
		inputTokens: sum(models.map((model) => model.inputTokens)),
		outputTokens: sum(models.map((model) => model.outputTokens)),
		costUSD: sum(models.map((model) => model.costUSD)),
		unpriced: sum(models.map((model) => model.unpriced)),
		verdicts,
		models
	};
}
function modelStats(records) {
	const [first] = records;
	const latencies = records.filter((record) => record.verdict !== "oversize").map((record) => record.latencyMs).toSorted((a, b) => a - b);
	return {
		provider: first?.provider ?? "",
		model: first?.model ?? "",
		reviews: records.length,
		inputTokens: sum(records.map((record) => record.inputTokens ?? 0)),
		outputTokens: sum(records.map((record) => record.outputTokens ?? 0)),
		costUSD: sum(records.map((record) => record.costUSD ?? 0)),
		unpriced: records.filter((record) => record.costUSD === null).length,
		medianLatencyMs: median(latencies)
	};
}
/** The middle value of sorted numbers, averaging the two middle ones. */
function median(sorted) {
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}
function formatStats(input) {
	const { stats } = input;
	const header = `auto-approval stats · ${stats.range} · ${input.project === void 0 ? "all projects" : "this project"}`;
	if (stats.reviews === 0) return `${header}\n\nno decision or chat reviews in this range\n`;
	const rows = [[
		"provider",
		"model",
		"reviews",
		"tokens in",
		"tokens out",
		"cost",
		"p50 latency"
	], ...stats.models.map((model) => [
		printable(model.provider),
		printable(model.model),
		integer(model.reviews),
		tokens(model.inputTokens),
		tokens(model.outputTokens),
		dollars(model.costUSD),
		`${integer(model.medianLatencyMs)} ms`
	])];
	const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
	const table = rows.map((row) => row.map((cell, column) => column < 2 ? cell.padEnd(widths?.[column] ?? 0) : cell.padStart(widths?.[column] ?? 0)).join("  ").trimEnd());
	const percent = (count) => `${Math.round(count / stats.reviews * 100)}%`;
	const verdicts = [
		"allow",
		"escalate",
		"deny",
		"error",
		"oversize"
	].map((verdict) => `${verdict} ${percent(stats.verdicts[verdict])}`).join(" · ");
	const unpriced = stats.unpriced === 0 ? "" : `\n${integer(stats.unpriced)} review(s) without a price (unknown model or no token count) are not in the cost.`;
	return [
		header,
		"",
		`reviews ${integer(stats.reviews)}   tokens ${tokens(stats.inputTokens)} in / ${tokens(stats.outputTokens)} out   cost ${dollars(stats.costUSD)}`,
		"",
		...table,
		"",
		`verdicts  ${verdicts}${unpriced}`,
		""
	].join("\n");
}
/**
* The log may come from elsewhere (`--file`); a control character in a model
* name must not reach the terminal as an escape sequence.
*/
function printable(text) {
	return text.replace(/[\p{Cc}\p{Cf}]/gu, "?");
}
function integer(value) {
	return Math.round(value).toLocaleString("en-US");
}
function tokens(value) {
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
	return integer(value);
}
function dollars(value) {
	if (value === 0) return "$0";
	if (value < .01) return `$${value.toFixed(5)}`;
	return `$${value.toFixed(2)}`;
}
//#endregion
//#region src/usage.ts
/**
* One line of the usage log: what a decision or chat review cost. It never holds
* the operation, the prompt or the reason — only numbers and identifiers.
*/
const usageRecordSchema = z.object({
	v: z.literal(1),
	time: z.string(),
	provider: z.string(),
	model: z.string(),
	/**
	* A hash of the project directory; `stats --project` hashes the same way. It
	* keeps the path out of the file but is not a secret: a guessed path can be
	* hashed and matched.
	*/
	project: z.string(),
	inputTokens: z.nullable(z.int().check(z.gte(0))),
	outputTokens: z.nullable(z.int().check(z.gte(0))),
	latencyMs: z.number().check(z.gte(0), z.lte(864e5)),
	/** `oversize`: too large for the model, so not sent (or refused or cut by it). */
	verdict: z.enum([
		"allow",
		"deny",
		"escalate",
		"error",
		"oversize"
	]),
	/** Priced when the review ran; `null` for a model without a known price. */
	costUSD: z.nullable(z.number().check(z.gte(0), z.lte(1e6)))
});
function usageLogPath(input = {}) {
	const dataHome = (input.env ?? process.env).XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "opencode-auto-approval-plugin", "usage.jsonl");
}
function projectID(input) {
	return createHash("sha256").update(resolve(input.directory)).digest("hex").slice(0, 16);
}
//#endregion
//#region src/cli.ts
const usage = `Usage: opencode-auto-approval-plugin stats [flags]

Show token usage and cost of decision and chat reviews (Jev, Clef, Chat Completions).

Flags:
  --days <n>         Show the last N days; 0 means today
  --year <yyyy>      Show a calendar year
  --all              Show lifetime statistics
  --project <dir>    Only reviews of one project; "." for the current directory
  --json             Output statistics as JSON
  --file <path>      Read another usage log (default: ${usageLogPath()})
  -h, --help         Show this help
`;
async function main(input) {
	const write = input.write ?? ((text) => process.stdout.write(text));
	const writeError = input.writeError ?? ((text) => process.stderr.write(text));
	let parsed;
	try {
		parsed = parseArgs({
			args: input.argv,
			allowPositionals: true,
			options: {
				days: { type: "string" },
				year: { type: "string" },
				all: { type: "boolean" },
				project: { type: "string" },
				json: { type: "boolean" },
				file: { type: "string" },
				help: {
					type: "boolean",
					short: "h"
				}
			}
		});
	} catch (error) {
		writeError(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		write(usage);
		return 0;
	}
	if (positionals.length !== 1 || positionals[0] !== "stats") {
		writeError(usage);
		return 2;
	}
	const now = input.now ?? /* @__PURE__ */ new Date();
	const range = statsRange({
		values,
		now
	});
	if (typeof range === "string") {
		writeError(`${range}\n\n${usage}`);
		return 2;
	}
	const project = values.project === void 0 ? void 0 : projectID({ directory: values.project });
	const path = values.file ?? usageLogPath();
	let log;
	try {
		log = await readUsageLog({ path });
	} catch (error) {
		writeError(`Cannot read the usage log ${path} (${error instanceof Error && "code" in error ? String(error.code) : "unreadable"}).\n`);
		return 1;
	}
	const stats = summarize({
		records: log.filter((record) => inRange({
			record,
			range,
			now
		}) && (project === void 0 || record.project === project)),
		range,
		now
	});
	write(values.json ? `${JSON.stringify(stats, null, 2)}\n` : formatStats({
		stats,
		...project === void 0 ? {} : { project }
	}));
	return 0;
}
function statsRange(input) {
	if ([
		input.values.days,
		input.values.year,
		input.values.all
	].filter((value) => value !== void 0 && value !== false).length > 1) return "Use only one of --days, --year and --all.";
	if (input.values.all) return { kind: "all" };
	if (input.values.days !== void 0) return /^\d{1,5}$/.test(input.values.days) ? {
		kind: "days",
		days: Number(input.values.days)
	} : "--days needs a whole number of days.";
	if (input.values.year !== void 0) return /^\d{4}$/.test(input.values.year) ? {
		kind: "year",
		year: Number(input.values.year)
	} : "--year needs a four-digit year.";
	return {
		kind: "year",
		year: input.now.getFullYear()
	};
}
/** Reads the log line by line; a missing file is an empty log and bad lines are skipped. */
async function readUsageLog(input) {
	const records = [];
	const stream = createReadStream(input.path, { encoding: "utf8" });
	try {
		for await (const line of createInterface({
			input: stream,
			crlfDelay: Infinity
		})) {
			if (line.trim() === "") continue;
			let value;
			try {
				value = JSON.parse(line);
			} catch {
				continue;
			}
			const record = z.safeParse(usageRecordSchema, value);
			if (record.success) records.push(record.data);
		}
	} catch (error) {
		if (isMissingFile(error)) return [];
		throw error;
	}
	return records;
}
function isMissingFile(error) {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
//#endregion
//#region src/bin.ts
process.exitCode = await main({ argv: process.argv.slice(2) });
//#endregion
export {};
