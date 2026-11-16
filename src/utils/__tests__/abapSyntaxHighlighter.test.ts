import { describe, it, expect } from 'vitest';
import {
  ABAP_SYNTAX_THEMES,
  ABAP_SYNTAX_THEME_LIST,
  AbapTokenType,
  normalizeAbapSyntaxTheme,
  resolveAbapThemeForSapGui,
  tokenizeAbapLine,
} from '../../components/AbapSyntaxHighlighter';

const ALL_TOKEN_TYPES: AbapTokenType[] = [
  'whitespace',
  'comment',
  'banner_comment',
  'user_logic_marker',
  'keyword',
  'builtin',
  'type',
  'sysvar',
  'string',
  'number',
  'field_symbol',
  'variable',
  'operator',
  'punctuation',
  'plain',
];

describe('tokenizeAbapLine', () => {
  it('treats full-line column-1 * comments and USER LOGIC markers distinctly', () => {
    const regular = tokenizeAbapLine('* Standard ABAP comment');
    expect(regular).toEqual([{ type: 'comment', value: '* Standard ABAP comment' }]);

    const marker = tokenizeAbapLine('*&--- BEGIN USER LOGIC');
    expect(marker).toEqual([{ type: 'user_logic_marker', value: '*&--- BEGIN USER LOGIC' }]);
  });

  it('keeps multi-word string literals and embedded double-quotes intact without misparsing as keywords or comments', () => {
    const tokens = tokenizeAbapLine("  gv_title = 'SELECT \"Demo\" Report' . \" inline note");
    expect(tokens.find((t) => t.type === 'string')?.value).toBe("'SELECT \"Demo\" Report'");
    expect(tokens.find((t) => t.type === 'comment')?.value).toBe('" inline note');
    expect(tokens.some((t) => t.type === 'keyword' && t.value === 'SELECT')).toBe(false);
    expect(tokens.find((t) => t.type === 'variable')?.value).toBe('gv_title');
  });

  it('highlights ABAP 7.40+ constructs, field-symbols, system variables, and -> / => operators', () => {
    const tokens = tokenizeAbapLine(
      '  IF sy-subrc = 0. go_alv->set_table( <ls_out>-vbeln ) INTO TABLE @DATA(lt_res).'
    );
    expect(tokens).toContainEqual({ type: 'keyword', value: 'IF' });
    expect(tokens).toContainEqual({ type: 'sysvar', value: 'sy-subrc' });
    expect(tokens).toContainEqual({ type: 'number', value: '0' });
    expect(tokens).toContainEqual({ type: 'variable', value: 'go_alv' });
    expect(tokens).toContainEqual({ type: 'operator', value: '->' });
    expect(tokens).toContainEqual({ type: 'field_symbol', value: '<ls_out>' });
    expect(tokens).toContainEqual({ type: 'operator', value: '@' });
    expect(tokens).toContainEqual({ type: 'keyword', value: 'DATA' });
    expect(tokens).toContainEqual({ type: 'variable', value: 'lt_res' });
  });

  it('highlights interpolated string templates |...| with inner expressions', () => {
    const tokens = tokenizeAbapLine('  lv_msg = |Rows: { lines( lt_out ) }|.');
    expect(tokens).toContainEqual({ type: 'variable', value: 'lv_msg' });
    expect(tokens).toContainEqual({ type: 'string', value: '|Rows: ' });
    expect(tokens).toContainEqual({ type: 'builtin', value: 'lines' });
    expect(tokens).toContainEqual({ type: 'variable', value: 'lt_out' });
    expect(tokens).toContainEqual({ type: 'string', value: '|' });
  });
});

describe('ABAP syntax highlighting themes & SAP GUI theme matching', () => {
  it('maps each SAP GUI theme to its harmonized ABAP syntax highlighting theme', () => {
    expect(resolveAbapThemeForSapGui('blue_crystal')).toBe('se38_light');
    expect(resolveAbapThemeForSapGui('belize')).toBe('solarized_light');
    expect(resolveAbapThemeForSapGui('quartz')).toBe('vscode_dark');
  });

  it('normalizes legacy light/dark values and explicit theme IDs safely', () => {
    expect(normalizeAbapSyntaxTheme('light')).toBe('se38_light');
    expect(normalizeAbapSyntaxTheme('dark')).toBe('vscode_dark');
    expect(normalizeAbapSyntaxTheme('monokai')).toBe('monokai');
    expect(normalizeAbapSyntaxTheme('solarized_light')).toBe('solarized_light');
    expect(normalizeAbapSyntaxTheme('solarized_dark')).toBe('solarized_dark');
    expect(normalizeAbapSyntaxTheme('unknown')).toBe('se38_light');
  });

  it('provides complete token classes, surface classes, and 4 color swatches for all 5 themes', () => {
    expect(ABAP_SYNTAX_THEME_LIST.map((t) => t.id)).toEqual([
      'se38_light',
      'vscode_dark',
      'monokai',
      'solarized_light',
      'solarized_dark',
    ]);

    for (const def of ABAP_SYNTAX_THEME_LIST) {
      expect(ABAP_SYNTAX_THEMES[def.id]).toBe(def);
      expect(def.swatches).toHaveLength(4);
      expect(def.surface.canvasClass).toBeTruthy();
      expect(def.surface.gutterClass).toBeTruthy();
      expect(def.surface.searchMarkClass).toBeTruthy();
      for (const tokType of ALL_TOKEN_TYPES) {
        expect(typeof def.tokens[tokType]).toBe('string');
        if (tokType !== 'whitespace') {
          expect(def.tokens[tokType].length).toBeGreaterThan(0);
        }
      }
    }
  });
});
