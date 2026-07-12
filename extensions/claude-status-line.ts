/**
 * Claude/Codex-style status line for pi.
 *
 * Shows: project, git branch, context usage, model, and thinking effort.
 * Toggle with: /status-line on|off
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

type ThinkingColor =
	| "thinkingOff"
	| "thinkingMinimal"
	| "thinkingLow"
	| "thinkingMedium"
	| "thinkingHigh"
	| "thinkingXhigh"
	| "thinkingMax";

const DEFAULT_THINKING = "high";
const STATUS_KEY = "claude-status-line";
const CONFIG_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const VALID_THINKING = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function readJsonFile(file: string): Record<string, unknown> | undefined {
	try {
		if (!existsSync(file)) return undefined;
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

function defaultThinkingLevel(ctx: ExtensionContext): string {
	const globalSettings = readJsonFile(join(CONFIG_DIR, "settings.json"));
	let level = typeof globalSettings?.defaultThinkingLevel === "string" ? globalSettings.defaultThinkingLevel : DEFAULT_THINKING;

	// Only honor project-local settings when pi has trusted the project.
	if (ctx.isProjectTrusted()) {
		const projectSettings = readJsonFile(join(ctx.cwd, ".pi", "settings.json"));
		if (typeof projectSettings?.defaultThinkingLevel === "string") level = projectSettings.defaultThinkingLevel;
	}

	return VALID_THINKING.has(level) ? level : DEFAULT_THINKING;
}

function latestThinkingLevel(ctx: ExtensionContext): string {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry?.type === "thinking_level_change" && typeof entry.thinkingLevel === "string") {
			return entry.thinkingLevel;
		}
	}
	return defaultThinkingLevel(ctx);
}

function thinkingColor(level: string): ThinkingColor {
	switch (level) {
		case "off":
			return "thinkingOff";
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "xhigh":
			return "thinkingXhigh";
		case "max":
			return "thinkingMax";
		case "high":
		default:
			return "thinkingHigh";
	}
}

function formatInt(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "?";
	return Math.max(0, Math.round(value)).toString();
}

function formatCompact(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "?";
	if (value >= 1_000_000) return `${Number.isInteger(value / 1_000_000) ? value / 1_000_000 : (value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${Number.isInteger(value / 1_000) ? value / 1_000 : (value / 1_000).toFixed(1)}k`;
	return Math.max(0, Math.round(value)).toString();
}

function aggregateAssistantUsage(ctx: ExtensionContext): { input: number; output: number; cost: number } {
	let input = 0;
	let output = 0;
	let cost = 0;

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const message = entry.message as AssistantMessage;
		input += message.usage?.input ?? 0;
		output += message.usage?.output ?? 0;
		cost += message.usage?.cost?.total ?? 0;
	}

	return { input, output, cost };
}

function friendlyModelName(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) return "no model";

	const raw = model.name && model.name !== model.id ? model.name : model.id;
	const normalized = raw.replace(/^anthropic[./:-]?/i, "").replace(/^openai[./:-]?/i, "");
	const lower = normalized.toLowerCase();

	const claude = lower.match(/(?:claude[-\s]*)?(opus|sonnet|haiku)[-\s]*(\d+(?:[._-]\d+)?)/i);
	if (claude) return `${capitalize(claude[1]!)} ${claude[2]!.replace(/[_-]/g, ".")}`;

	const gpt = lower.match(/gpt[-\s.]*(\d+(?:[._-]\d+)?(?:[-\s.]?[a-z]+)?)/i);
	if (gpt) return `GPT-${gpt[1]!.replace(/[_\s]/g, ".")}`;

	return normalized
		.split(/[._-]+/g)
		.filter(Boolean)
		.map((part) => (part.length <= 3 ? part.toUpperCase() : capitalize(part)))
		.join(" ");
}

function capitalize(value: string): string {
	return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function projectName(cwd: string): string {
	const name = basename(cwd);
	return name || cwd;
}

function compactBranch(branch: string, available: number): string {
	if (available <= 0) return branch;
	if (visibleWidth(branch) <= available) return branch;
	return truncateToWidth(branch, available, "…");
}

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let thinkingLevel = DEFAULT_THINKING;
	let requestRender: (() => void) | undefined;

	function install(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") return;
		thinkingLevel = latestThinkingLevel(ctx);

		ctx.ui.setFooter((tui, theme, footerData) => {
			const refresh = () => tui.requestRender();
			requestRender = refresh;
			const unsubscribeBranch = footerData.onBranchChange(refresh);

			return {
				dispose() {
					unsubscribeBranch();
					if (requestRender === refresh) requestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const usage = ctx.getContextUsage();
					const modelContext = usage?.contextWindow ?? ctx.model?.contextWindow;
					const currentTokens = usage?.tokens ?? aggregateAssistantUsage(ctx).input;

					const folderSegment = `${theme.fg("dim", "📁 ")}${theme.fg("accent", projectName(ctx.cwd))}`;

					let branchName = footerData.getGitBranch();
					if (branchName) {
						// Leave room for the fixed segments before truncating long branch names.
						branchName = compactBranch(branchName, Math.max(12, Math.floor(width * 0.32)));
					}
					const branchSegment = branchName
						? `${theme.fg("dim", " ")}${theme.fg("muted", branchName)}`
						: `${theme.fg("dim", " ")}${theme.fg("dim", "no git")}`;

					const contextPercent =
						usage?.percent ??
						(currentTokens !== null && currentTokens !== undefined && modelContext
							? (currentTokens / modelContext) * 100
							: null);
					const contextLabel = `${formatInt(currentTokens)}/${formatInt(modelContext)} (${formatInt(contextPercent)}%)`;
					const contextSegment = `${theme.fg("success", "▣ ")}${theme.fg("success", contextLabel)}`;
					const modelSegment = `${theme.fg("accent", "🤖 ")}${theme.fg("accent", `${friendlyModelName(ctx)} (${formatCompact(modelContext)} context)`)}`;
					const effortSegment = `${theme.fg("dim", "💡 ")}${theme.fg(thinkingColor(thinkingLevel), thinkingLevel)}`;

					const otherStatuses = Array.from(footerData.getExtensionStatuses().entries())
						.filter(([key]) => key !== STATUS_KEY)
						.map(([, status]) => status)
						.filter(Boolean);

					const segments = [folderSegment, branchSegment, contextSegment, modelSegment, effortSegment, ...otherStatuses];
					const line = segments.join(theme.fg("dim", "  "));
					return [truncateToWidth(line, width, "…")];
				},
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) install(ctx);
	});

	pi.on("thinking_level_select", async (event) => {
		thinkingLevel = event.level;
		requestRender?.();
	});

	pi.on("model_select", async () => {
		requestRender?.();
	});

	pi.on("message_end", async () => {
		requestRender?.();
	});

	pi.on("agent_start", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "working"));
		requestRender?.();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		requestRender?.();
	});

	pi.registerCommand("status-line", {
		description: "Toggle the Claude/Codex-style status line: /status-line on|off",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "off" || arg === "disable" || arg === "disabled") {
				enabled = false;
				ctx.ui.setFooter(undefined);
				ctx.ui.setStatus(STATUS_KEY, undefined);
				ctx.ui.notify("Status line disabled", "info");
				return;
			}

			if (arg === "" || arg === "on" || arg === "enable" || arg === "enabled") {
				enabled = true;
				install(ctx);
				ctx.ui.notify("Status line enabled", "info");
				return;
			}

			ctx.ui.notify("Usage: /status-line [on|off]", "error");
		},
	});
}
