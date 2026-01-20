import { hid_usage_from_page_and_id } from "../hid-usages";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

export type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export function keyboardCodeToHidUsage(code: string): number | null {
  if (code.startsWith("Key") && code.length === 4) {
    const letter = code.charCodeAt(3);
    if (letter >= 65 && letter <= 90) {
      // A(0x04) .. Z(0x1d)
      return hid_usage_from_page_and_id(7, 4 + (letter - 65));
    }
  }

  if (code.startsWith("Digit") && code.length === 6) {
    const n = Number(code.slice(5));
    if (Number.isFinite(n)) {
      // 1..9 => 0x1e..0x26, 0 => 0x27
      const id = n === 0 ? 39 : 29 + n;
      return hid_usage_from_page_and_id(7, id);
    }
  }

  if (code.startsWith("F")) {
    const n = Number(code.slice(1));
    if (n >= 1 && n <= 12) {
      return hid_usage_from_page_and_id(7, 57 + (n - 1));
    }
  }

  switch (code) {
    case "Enter":
      return hid_usage_from_page_and_id(7, 40);
    case "Escape":
      return hid_usage_from_page_and_id(7, 41);
    case "Backspace":
      return hid_usage_from_page_and_id(7, 42);
    case "Tab":
      return hid_usage_from_page_and_id(7, 43);
    case "Space":
      return hid_usage_from_page_and_id(7, 44);
    case "Minus":
      return hid_usage_from_page_and_id(7, 45);
    case "Equal":
      return hid_usage_from_page_and_id(7, 46);
    case "BracketLeft":
      return hid_usage_from_page_and_id(7, 47);
    case "BracketRight":
      return hid_usage_from_page_and_id(7, 48);
    case "Backslash":
      return hid_usage_from_page_and_id(7, 49);
    case "Semicolon":
      return hid_usage_from_page_and_id(7, 51);
    case "Quote":
      return hid_usage_from_page_and_id(7, 52);
    case "Backquote":
      return hid_usage_from_page_and_id(7, 53);
    case "Comma":
      return hid_usage_from_page_and_id(7, 54);
    case "Period":
      return hid_usage_from_page_and_id(7, 55);
    case "Slash":
      return hid_usage_from_page_and_id(7, 56);
    case "CapsLock":
      return hid_usage_from_page_and_id(7, 57);
    case "PrintScreen":
      return hid_usage_from_page_and_id(7, 70);
    case "ScrollLock":
      return hid_usage_from_page_and_id(7, 71);
    case "Pause":
      return hid_usage_from_page_and_id(7, 72);
    case "Insert":
      return hid_usage_from_page_and_id(7, 73);
    case "Home":
      return hid_usage_from_page_and_id(7, 74);
    case "PageUp":
      return hid_usage_from_page_and_id(7, 75);
    case "Delete":
      return hid_usage_from_page_and_id(7, 76);
    case "End":
      return hid_usage_from_page_and_id(7, 77);
    case "PageDown":
      return hid_usage_from_page_and_id(7, 78);
    case "ArrowRight":
      return hid_usage_from_page_and_id(7, 79);
    case "ArrowLeft":
      return hid_usage_from_page_and_id(7, 80);
    case "ArrowDown":
      return hid_usage_from_page_and_id(7, 81);
    case "ArrowUp":
      return hid_usage_from_page_and_id(7, 82);

    // Modifiers
    case "ControlLeft":
      return hid_usage_from_page_and_id(7, 224);
    case "ShiftLeft":
      return hid_usage_from_page_and_id(7, 225);
    case "AltLeft":
      return hid_usage_from_page_and_id(7, 226);
    case "MetaLeft":
      return hid_usage_from_page_and_id(7, 227);
    case "ControlRight":
      return hid_usage_from_page_and_id(7, 228);
    case "ShiftRight":
      return hid_usage_from_page_and_id(7, 229);
    case "AltRight":
      return hid_usage_from_page_and_id(7, 230);
    case "MetaRight":
      return hid_usage_from_page_and_id(7, 231);
  }

  if (code.startsWith("Numpad")) {
    const rest = code.slice("Numpad".length);
    if (/^\d$/.test(rest)) {
      const n = Number(rest);
      return hid_usage_from_page_and_id(7, 89 + n); // 0x62..0x6b
    }
    switch (rest) {
      case "Enter":
        return hid_usage_from_page_and_id(7, 88);
      case "Add":
        return hid_usage_from_page_and_id(7, 87);
      case "Subtract":
        return hid_usage_from_page_and_id(7, 86);
      case "Multiply":
        return hid_usage_from_page_and_id(7, 85);
      case "Divide":
        return hid_usage_from_page_and_id(7, 84);
      case "Decimal":
        return hid_usage_from_page_and_id(7, 99);
    }
  }

  return null;
}

export function extractHidUsageFromBinding(
  binding: BehaviorBinding,
  behavior: GetBehaviorDetailsResponse | undefined
): number | null {
  if (!behavior?.metadata || behavior.metadata.length === 0) {
    return null;
  }

  for (const set of behavior.metadata) {
    const p1HasUsage = (set.param1 || []).some(
      (p: any) => p.hidUsage !== undefined
    );
    const p2HasUsage = (set.param2 || []).some(
      (p: any) => p.hidUsage !== undefined
    );

    if (p1HasUsage && !p2HasUsage) return binding.param1;
    if (p2HasUsage && !p1HasUsage) return binding.param2;
  }

  return null;
}

export function findKeyPositionsByHidUsage(opts: {
  keymapBindings: BehaviorBinding[];
  behaviors: BehaviorMap;
  usage: number;
}): number[] {
  const { keymapBindings, behaviors, usage } = opts;
  const positions: number[] = [];
  for (let i = 0; i < keymapBindings.length; i++) {
    const binding = keymapBindings[i];
    const behavior = behaviors[binding.behaviorId];
    const u = extractHidUsageFromBinding(binding, behavior);
    if (u === usage) {
      positions.push(i);
    }
  }
  return positions;
}
