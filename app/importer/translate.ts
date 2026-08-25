import zhCN from "scratchblocks-plus/locales/zh-cn.json";
import zhTW from "scratchblocks-plus/locales/zh-tw.json";
import { blockName } from "scratchblocks-plus/syntax/blocks.js";
import * as scratchblocks from "scratchblocks-plus/syntax/index.js";
import type {
  SyntaxBlock,
  SyntaxChild,
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

function customBlockPattern(block: SyntaxBlock) {
  const argumentsFound: SyntaxChild[] = [];
  const tokens: string[] = [];
  for (const child of block.children) {
    if (child.isIcon) continue;
    if (child.isLabel) {
      const text = String(child.value ?? "").trim();
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
  block: SyntaxBlock,
  localizedPattern: string,
  argumentsFound: SyntaxChild[],
) {
  const children: SyntaxChild[] = [];
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

function translateFields(blocks: SyntaxBlock[], maps: LegacyNameMaps) {
  for (const block of blocks) {
    if (block.isComment && block.label) {
      block.label.value =
        maps.comments?.[block.label.value.trim()] ?? block.label.value;
      continue;
    }
    if (block.comment) {
      block.comment.label.value =
        maps.comments?.[block.comment.label.value.trim()] ??
        block.comment.label.value;
    }
    if (block.info.selector === "readVariable") {
      const translated = maps.vars?.[blockName(block)];
      if (translated) block.children = [new scratchblocks.Label(translated)];
      continue;
    }
    if (block.info.category === "custom-arg") {
      const translated = maps.params?.[blockName(block)];
      if (translated) block.children = [new scratchblocks.Label(translated)];
      continue;
    }
    if (block.isOutline || block.info.id === "PROCEDURES_CALL") {
      const { pattern, argumentsFound } = customBlockPattern(block);
      const translated = maps.procs?.[pattern];
      if (translated) applyLocalizedPattern(block, translated, argumentsFound);
    }

    for (const child of block.children) {
      if (child.isScript && child.blocks) {
        translateFields(child.blocks, maps);
      } else if (child.isBlock) {
        translateFields([child as SyntaxBlock], maps);
      }
      if (child.shape === "dropdown" && !child.menu) {
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
