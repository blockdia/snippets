import zhCN from "scratchblocks-plus/locales/zh-cn.json";
import zhTW from "scratchblocks-plus/locales/zh-tw.json";
import * as scratchblocks from "scratchblocks-plus/syntax/index.js";
import type {
  Block,
  BlockChild,
  ScriptBlock,
} from "scratchblocks-plus/syntax/index.js";

import type { Locale } from "../i18n/locales";

export interface LegacyNameMaps {
  vars?: Record<string, string>;
  lists?: Record<string, string>;
  events?: Record<string, string>;
  params?: Record<string, string>;
  procs?: Record<string, string>;
  comments?: Record<string, string>;
}

scratchblocks.loadLanguages({ zh_cn: zhCN, zh_tw: zhTW });

function customBlockPattern(block: Block) {
  const argumentsFound: BlockChild[] = [];
  const tokens: string[] = [];
  for (const child of block.children) {
    if (child.isIcon) continue;
    if (child.isLabel) {
      const text = child.value.trim();
      if (text) tokens.push(text);
    } else if (!child.isScript) {
      argumentsFound.push(child);
      tokens.push(`%${argumentsFound.length}`);
    }
  }
  return {
    pattern: tokens.join(" ").replace(/\s+/g, " ").trim(),
    argumentsFound,
  };
}

function applyLocalizedPattern(
  block: Block,
  localizedPattern: string,
  argumentsFound: BlockChild[],
) {
  const children: BlockChild[] = [];
  for (const part of localizedPattern.split(/(%\d+)/)) {
    const placeholder = part.match(/^%(\d+)$/);
    if (placeholder) {
      const argument = argumentsFound[Number.parseInt(placeholder[1], 10) - 1];
      if (argument) children.push(argument);
      continue;
    }
    for (const word of part.trim().split(/\s+/).filter(Boolean)) {
      children.push(new scratchblocks.Label(word));
    }
  }
  if (children.length) block.children = children;
}

function translateComment(value: string, maps: LegacyNameMaps): string {
  return maps.comments?.[value.trim()] ?? value;
}

function translateNode(node: BlockChild, maps: LegacyNameMaps): void {
  if (node.isScript) {
    translateFields(node.blocks, maps);
  } else if (node.isBlock) {
    translateBlock(node, maps);
  } else if (node.isGlow) {
    translateNode(node.child, maps);
  } else if (node.isComment) {
    node.label.value = translateComment(node.label.value, maps);
  }
}

function translateBlock(block: Block, maps: LegacyNameMaps): void {
  if (block.comment) {
    block.comment.label.value = translateComment(
      block.comment.label.value,
      maps,
    );
  }
  if (block.info.selector === "readVariable") {
    const name = scratchblocks.blockName(block);
    const translated = name ? maps.vars?.[name] : undefined;
    if (translated) block.children = [new scratchblocks.Label(translated)];
    return;
  }
  if (block.info.category === "custom-arg") {
    const name = scratchblocks.blockName(block);
    const translated = name ? maps.params?.[name] : undefined;
    if (translated) block.children = [new scratchblocks.Label(translated)];
    return;
  }
  if (block.isOutline || block.info.id === "PROCEDURES_CALL") {
    const { pattern, argumentsFound } = customBlockPattern(block);
    const translated = maps.procs?.[pattern];
    if (translated) applyLocalizedPattern(block, translated, argumentsFound);
  }

  for (const child of block.children) {
    translateNode(child, maps);
    if (child.isInput && child.shape === "dropdown" && !child.menu) {
      const current = String(child.value ?? "");
      if (block.info.category === "variables") {
        child.value = maps.vars?.[current] ?? current;
      } else if (block.info.category === "list") {
        child.value = maps.lists?.[current] ?? current;
      } else if (block.info.category === "events") {
        child.value = maps.events?.[current] ?? current;
      }
    }
  }
}

function translateFields(blocks: ScriptBlock[], maps: LegacyNameMaps): void {
  for (const block of blocks) translateNode(block, maps);
}

export function translateLegacyScratchblocks(
  source: string,
  locale: Locale,
  maps: LegacyNameMaps,
): string {
  if (locale === "en") return source;
  const targetCode = locale === "zh-CN" ? "zh_cn" : "zh_tw";
  const targetLanguage = scratchblocks.allLanguages[targetCode];
  if (!targetLanguage) return source;

  try {
    const document = scratchblocks.parse(source, {
      languages: Object.keys(scratchblocks.allLanguages),
    });
    document.translate(targetLanguage);
    for (const script of document.scripts) {
      translateFields(script.blocks, maps);
    }
    return document.stringify() || source;
  } catch {
    return source;
  }
}
