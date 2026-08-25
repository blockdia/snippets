declare module "scratchblocks-plus/syntax/index.js" {
  export interface SyntaxLabel {
    isLabel: true;
    value: string;
  }

  export interface SyntaxChild {
    isIcon?: boolean;
    isLabel?: boolean;
    isScript?: boolean;
    isBlock?: boolean;
    shape?: string;
    menu?: string;
    value?: string;
    blocks?: SyntaxBlock[];
  }

  export interface SyntaxBlock {
    isComment?: boolean;
    isOutline?: boolean;
    label?: { value: string };
    comment?: { label: { value: string } };
    info: { selector?: string; category?: string; id?: string };
    children: SyntaxChild[];
  }

  export interface SyntaxDocument {
    scripts: { blocks: SyntaxBlock[] }[];
    translate(language: unknown): void;
    stringify(): string;
  }

  export const allLanguages: Record<string, unknown>;
  export function loadLanguages(languages: Record<string, unknown>): void;
  export function parse(
    source: string,
    options?: { languages?: string[] },
  ): SyntaxDocument;
  export class Label implements SyntaxLabel {
    constructor(value: string);
    isLabel: true;
    value: string;
  }
}

declare module "scratchblocks-plus/syntax/blocks.js" {
  import type { SyntaxBlock } from "scratchblocks-plus/syntax/index.js";
  export function blockName(block: SyntaxBlock): string;
}
