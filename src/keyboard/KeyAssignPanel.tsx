import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BehaviorBindingParametersSet,
  BehaviorParameterValueDescription,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { hid_usage_get_labels, hid_usage_from_page_and_id } from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

type BehaviorGroup = "key" | "layerTap" | "bluetooth" | "modTap" | "other";
type Category = "main" | "mods" | "nav" | "func" | "media";
type BluetoothKind = "bluetooth" | "output";

const KEYBOARD_PAGE = 7;
const CONSUMER_PAGE = 12;

function removeKeyboardPrefix(label?: string) {
  return label?.replace(/^Keyboard\s+/, "") || "";
}

function makeUsage(page: number, id: number) {
  return hid_usage_from_page_and_id(page, id);
}

function usageLabel(page: number, id: number) {
  return removeKeyboardPrefix(hid_usage_get_labels(page, id).short);
}

function getHidUsageCaps(behavior: GetBehaviorDetailsResponse): {
  keyboardMax: number;
  consumerMax: number;
} | null {
  const hidParam = (behavior.metadata || [])
    .flatMap((set) => [...(set.param1 || []), ...(set.param2 || [])])
    .find((param) => param.hidUsage !== undefined)?.hidUsage;

  if (!hidParam) {
    return null;
  }

  return {
    keyboardMax: hidParam.keyboardMax || 0,
    consumerMax: hidParam.consumerMax || 0,
  };
}

function getQuickHidUsageBehaviors(
  behaviors: BehaviorMap,
  category: Category
): GetBehaviorDetailsResponse[] {
  const all = Object.values(behaviors).filter((b) => getHidUsageCaps(b) !== null);

  if (all.length === 0) {
    return [];
  }

  const filtered = all.filter((b) => {
    const caps = getHidUsageCaps(b);
    if (!caps) return false;
    return category === "media" ? caps.consumerMax > 0 : caps.keyboardMax > 0;
  });

  return filtered.length > 0 ? filtered : all;
}

function hasLayerIdParam(behavior: GetBehaviorDetailsResponse) {
  return (behavior.metadata || []).some((set) =>
    [...(set.param1 || []), ...(set.param2 || [])].some(
      (p) => p.layerId !== undefined
    )
  );
}

function hasHidUsageParam(behavior: GetBehaviorDetailsResponse) {
  return (behavior.metadata || []).some((set) =>
    [...(set.param1 || []), ...(set.param2 || [])].some(
      (p) => p.hidUsage !== undefined
    )
  );
}

function hasConstantParam(behavior: GetBehaviorDetailsResponse) {
  return (behavior.metadata || []).some((set) =>
    [...(set.param1 || []), ...(set.param2 || [])].some(
      (p) => p.constant !== undefined
    )
  );
}

function getQuickLayerTapBehaviors(behaviors: BehaviorMap) {
  return Object.values(behaviors).filter((b) => hasLayerIdParam(b) && hasHidUsageParam(b));
}

function inferSingleConstantParam(
  behavior: GetBehaviorDetailsResponse
): { constParam: "param1" | "param2" } | null {
  const p1 = (behavior.metadata || []).flatMap((s) => s.param1 || []);
  const p2 = (behavior.metadata || []).flatMap((s) => s.param2 || []);

  const p1HasConst = p1.some((p) => p.constant !== undefined);
  const p2HasConst = p2.some((p) => p.constant !== undefined);

  const p1HasOther =
    p1.some((p) => p.hidUsage || p.layerId || p.range) ||
    (p1.length > 0 && !p1HasConst);
  const p2HasOther =
    p2.some((p) => p.hidUsage || p.layerId || p.range) ||
    (p2.length > 0 && !p2HasConst);

  if (p1HasConst && !p2HasConst && p2.length === 0 && !p1HasOther) {
    return { constParam: "param1" };
  }
  if (p2HasConst && !p1HasConst && p1.length === 0 && !p2HasOther) {
    return { constParam: "param2" };
  }

  return null;
}

function collectConstantChoices(
  behavior: GetBehaviorDetailsResponse,
  param: "param1" | "param2"
): BehaviorParameterValueDescription[] {
  const choices = new Map<number, BehaviorParameterValueDescription>();
  for (const set of behavior.metadata || []) {
    const arr = (param === "param1" ? set.param1 : set.param2) || [];
    for (const d of arr) {
      if (d.constant === undefined) continue;
      if (!choices.has(d.constant)) {
        choices.set(d.constant, d);
      }
    }
  }
  return [...choices.values()].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
}

function getQuickBluetoothBehaviors(behaviors: BehaviorMap) {
  const base = Object.values(behaviors).filter(
    (b) => hasConstantParam(b) && !hasHidUsageParam(b) && !hasLayerIdParam(b)
  );
  const byName = base.filter((b) => /bluetooth|output/i.test(b.displayName));
  return byName.length > 0 ? byName : base;
}

function getQuickModTapBehaviors(behaviors: BehaviorMap) {
  return Object.values(behaviors).filter(
    (b) => hasHidUsageParam(b) && hasConstantParam(b) && !hasLayerIdParam(b)
  );
}

const BT_ACTION_LABELS = [
  "Next Profile",
  "Previous Profile",
  "Clear All Profiles",
  "Clear Selected Profile",
  "Select Profile",
  "Disconnect Profile",
] as const;

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

function inferBluetoothParamOrder(behavior: GetBehaviorDetailsResponse): {
  actionParam: "param1" | "param2";
  profileParam: "param1" | "param2" | null;
} | null {
  const expected = new Set(BT_ACTION_LABELS.map(normalizeName));

  for (const set of behavior.metadata || []) {
    const p1Consts = (set.param1 || []).filter((p) => p.constant !== undefined);
    const p2Consts = (set.param2 || []).filter((p) => p.constant !== undefined);
    const p1Score = p1Consts.filter((c) => expected.has(normalizeName(c.name))).length;
    const p2Score = p2Consts.filter((c) => expected.has(normalizeName(c.name))).length;

    if (p1Score === 0 && p2Score === 0) {
      continue;
    }

    const actionParam: "param1" | "param2" = p1Score >= p2Score ? "param1" : "param2";
    const otherParam: "param1" | "param2" = actionParam === "param1" ? "param2" : "param1";
    const otherArr = (otherParam === "param1" ? set.param1 : set.param2) || [];

    return { actionParam, profileParam: otherArr.length > 0 ? otherParam : null };
  }

  // Fallback for devices where action names aren't available in metadata
  const simple = inferSingleConstantParam(behavior);
  if (simple) {
    return { actionParam: simple.constParam, profileParam: null };
  }

  return null;
}

function findMetadataSetForAction(
  behavior: GetBehaviorDetailsResponse,
  actionParam: "param1" | "param2",
  actionValue: number
): BehaviorBindingParametersSet | null {
  for (const set of behavior.metadata || []) {
    const arr = (actionParam === "param1" ? set.param1 : set.param2) || [];
    if (arr.some((d) => d.constant === actionValue)) {
      return set;
    }
  }
  return null;
}

function getProfileParamDescriptors(
  set: BehaviorBindingParametersSet | null,
  profileParam: "param1" | "param2" | null
): BehaviorParameterValueDescription[] {
  if (!set || !profileParam) {
    return [];
  }
  return (profileParam === "param1" ? set.param1 : set.param2) || [];
}

function defaultProfileValue(descriptors: BehaviorParameterValueDescription[]) {
  if (descriptors.length === 0) return 0;
  if (descriptors.every((d) => d.constant !== undefined)) {
    return descriptors[0].constant!;
  }
  if (descriptors.length === 1 && descriptors[0].range) {
    return descriptors[0].range.min;
  }
  return 0;
}

function inferLayerTapParamOrder(
  behavior: GetBehaviorDetailsResponse
): { layerParam: "param1" | "param2"; usageParam: "param1" | "param2" } | null {
  for (const set of behavior.metadata || []) {
    const p1HasLayer = (set.param1 || []).some((p) => p.layerId !== undefined);
    const p2HasLayer = (set.param2 || []).some((p) => p.layerId !== undefined);
    const p1HasUsage = (set.param1 || []).some((p) => p.hidUsage !== undefined);
    const p2HasUsage = (set.param2 || []).some((p) => p.hidUsage !== undefined);

    if (p1HasLayer && p2HasUsage) {
      return { layerParam: "param1", usageParam: "param2" };
    }
    if (p2HasLayer && p1HasUsage) {
      return { layerParam: "param2", usageParam: "param1" };
    }
  }

  return null;
}

function inferModTapParamOrder(
  behavior: GetBehaviorDetailsResponse
): { modParam: "param1" | "param2"; usageParam: "param1" | "param2" } | null {
  for (const set of behavior.metadata || []) {
    const p1HasConst = (set.param1 || []).some((p) => p.constant !== undefined);
    const p2HasConst = (set.param2 || []).some((p) => p.constant !== undefined);
    const p1HasUsage = (set.param1 || []).some((p) => p.hidUsage !== undefined);
    const p2HasUsage = (set.param2 || []).some((p) => p.hidUsage !== undefined);

    if (p1HasConst && p2HasUsage) {
      return { modParam: "param1", usageParam: "param2" };
    }
    if (p2HasConst && p1HasUsage) {
      return { modParam: "param2", usageParam: "param1" };
    }
  }
  return null;
}

const CATEGORY_LABELS: Record<Category, string> = {
  main: "Main",
  mods: "Mods",
  nav: "Nav",
  func: "Func",
  media: "Media",
};

const GROUP_LABELS: Record<BehaviorGroup, string> = {
  key: "Key",
  layerTap: "Layer Tap",
  bluetooth: "Bluetooth",
  modTap: "Mod-tap",
  other: "Other",
};

const BLUETOOTH_KIND_LABELS: Record<BluetoothKind, string> = {
  bluetooth: "Bluetooth",
  output: "Output Selection",
};

function letterUsageId(letter: string): number {
  const up = letter.toUpperCase();
  const code = up.charCodeAt(0);
  if (code < 65 || code > 90) {
    throw new Error(`Invalid letter: ${letter}`);
  }
  return 4 + (code - 65);
}

function KeyButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "px-2 py-1 rounded text-sm border transition-colors",
        disabled
          ? "bg-base-200 text-base-content/40 border-base-300 cursor-not-allowed"
          : "bg-base-100 text-base-content border-base-300 hover:bg-base-300",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type KeySpec = {
  usage: number;
  label: string;
  width?: number;
  match?: boolean;
};

function KbdKey({
  spec,
  active,
  disabled,
  onClick,
}: {
  spec: KeySpec;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const match = spec.match ?? true;

  return (
    <button
      type="button"
      disabled={disabled || !match}
      className={[
        "h-10 rounded border text-sm px-2 select-none",
        "bg-base-100 text-base-content border-base-300",
        disabled || !match
          ? "opacity-40 cursor-not-allowed"
          : "hover:bg-base-300 transition-colors",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
      style={{
        flexGrow: spec.width || 1,
        flexBasis: 0,
      }}
      onClick={onClick}
      title={spec.label}
    >
      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
        {spec.label}
      </span>
    </button>
  );
}

function KeyboardPalette({
  rows,
  activeUsage,
  disabled,
  onUsageClicked,
}: {
  rows: KeySpec[][];
  activeUsage: number | undefined;
  disabled: boolean;
  onUsageClicked: (usage: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1">
          {row.map((k) => (
            <KbdKey
              key={k.usage}
              spec={k}
              active={activeUsage === k.usage}
              disabled={disabled}
              onClick={() => onUsageClicked(k.usage)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CategoryButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "px-3 py-1 rounded text-sm border",
        disabled
          ? "bg-base-200 text-base-content/40 border-base-300 cursor-not-allowed"
          : active
            ? "bg-primary text-primary-content border-primary"
            : "bg-base-100 text-base-content border-base-300 hover:bg-base-300",
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function KeyAssignPanel({
  selectedKeyPosition,
  selectedLayerIndex,
  selectedBinding,
  behaviors,
  layers,
  onExitEditMode,
  onBindingChanged,
  canImportExport,
  onExportKeymap,
  onImportKeymap,
}: {
  selectedKeyPosition: number | undefined;
  selectedLayerIndex: number;
  selectedBinding: BehaviorBinding | null;
  behaviors: BehaviorMap;
  layers: { id: number; name: string }[];
  onExitEditMode: () => void;
  onBindingChanged: (binding: BehaviorBinding) => void;
  canImportExport: boolean;
  onExportKeymap: () => void;
  onImportKeymap: (file: File) => void;
}) {
  const [behaviorGroup, setBehaviorGroup] = useState<BehaviorGroup>("key");
  const [category, setCategory] = useState<Category>("main");
  const [bluetoothKind, setBluetoothKind] = useState<BluetoothKind>("bluetooth");
  const [quickBehaviorId, setQuickBehaviorId] = useState<number | undefined>(
    undefined
  );
  const [layerTapBehaviorId, setLayerTapBehaviorId] = useState<
    number | undefined
  >(undefined);
  const [layerTapTargetLayerId, setLayerTapTargetLayerId] = useState<
    number | undefined
  >(layers[0]?.id);
  const [bluetoothBehaviorId, setBluetoothBehaviorId] = useState<
    number | undefined
  >(undefined);
  const [bluetoothActionValue, setBluetoothActionValue] = useState<
    number | undefined
  >(undefined);
  const [bluetoothProfileValue, setBluetoothProfileValue] = useState<
    number | undefined
  >(undefined);
  const [modTapBehaviorId, setModTapBehaviorId] = useState<number | undefined>(
    undefined
  );
  const [modTapModifierValue, setModTapModifierValue] = useState<
    number | undefined
  >(undefined);

  const quickBehaviors = useMemo(() => {
    const sorted = getQuickHidUsageBehaviors(behaviors, category).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    return sorted;
  }, [behaviors, category]);

  const layerTapBehaviors = useMemo(() => {
    const sorted = getQuickLayerTapBehaviors(behaviors).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    return sorted;
  }, [behaviors]);

  const bluetoothBehaviors = useMemo(() => {
    const sorted = getQuickBluetoothBehaviors(behaviors).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    return sorted;
  }, [behaviors]);

  const bluetoothBehaviorsForKind = useMemo(() => {
    const kindRe = bluetoothKind === "output" ? /output/i : /bluetooth/i;
    const matches = bluetoothBehaviors.filter((b) => kindRe.test(b.displayName));
    return matches.length > 0 ? matches : bluetoothBehaviors;
  }, [bluetoothBehaviors, bluetoothKind]);

  useEffect(() => {
    if (behaviorGroup !== "bluetooth") {
      return;
    }
    setBluetoothBehaviorId(undefined);
  }, [behaviorGroup, bluetoothKind]);

  const modTapBehaviors = useMemo(() => {
    const sorted = getQuickModTapBehaviors(behaviors).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    return sorted;
  }, [behaviors]);

  useEffect(() => {
    if (!selectedBinding) {
      return;
    }

    const allowed = new Set(quickBehaviors.map((b) => b.id));
    if (allowed.has(selectedBinding.behaviorId)) {
      setQuickBehaviorId(selectedBinding.behaviorId);
    }
  }, [selectedBinding, quickBehaviors]);

  useEffect(() => {
    if (!selectedBinding) {
      return;
    }

    const allowed = new Set(layerTapBehaviors.map((b) => b.id));
    if (allowed.has(selectedBinding.behaviorId)) {
      setLayerTapBehaviorId(selectedBinding.behaviorId);
    }
  }, [selectedBinding, layerTapBehaviors]);

  useEffect(() => {
    if (!selectedBinding) {
      return;
    }

    const allowed = new Set(bluetoothBehaviors.map((b) => b.id));
    if (allowed.has(selectedBinding.behaviorId)) {
      setBluetoothBehaviorId(selectedBinding.behaviorId);
      setBehaviorGroup("bluetooth");
    }
  }, [selectedBinding, bluetoothBehaviors]);

  useEffect(() => {
    if (!selectedBinding) {
      return;
    }

    const allowed = new Set(modTapBehaviors.map((b) => b.id));
    if (allowed.has(selectedBinding.behaviorId)) {
      setModTapBehaviorId(selectedBinding.behaviorId);
      setBehaviorGroup("modTap");
    }
  }, [selectedBinding, modTapBehaviors]);

  useEffect(() => {
    if (!selectedBinding || layerTapBehaviorId === undefined) {
      return;
    }

    if (selectedBinding.behaviorId !== layerTapBehaviorId) {
      return;
    }

    const behavior = layerTapBehaviors.find((b) => b.id === layerTapBehaviorId);
    if (!behavior) {
      return;
    }

    const order = inferLayerTapParamOrder(behavior);
    if (!order) {
      return;
    }

    const layerId =
      order.layerParam === "param1" ? selectedBinding.param1 : selectedBinding.param2;

    if (layers.some((l) => l.id === layerId)) {
      setLayerTapTargetLayerId(layerId);
      setBehaviorGroup("layerTap");
    }
  }, [selectedBinding, layerTapBehaviorId, layerTapBehaviors, layers]);

  useEffect(() => {
    if (!selectedBinding || modTapBehaviorId === undefined) {
      return;
    }

    if (selectedBinding.behaviorId !== modTapBehaviorId) {
      return;
    }

    const behavior = modTapBehaviors.find((b) => b.id === modTapBehaviorId);
    if (!behavior) {
      return;
    }

    const order = inferModTapParamOrder(behavior);
    if (!order) {
      return;
    }

    const modValue =
      order.modParam === "param1" ? selectedBinding.param1 : selectedBinding.param2;
    setModTapModifierValue(modValue);
  }, [selectedBinding, modTapBehaviorId, modTapBehaviors]);

  useEffect(() => {
    const behavior = modTapBehaviors.find((b) => b.id === modTapBehaviorId);
    if (!behavior) {
      setModTapModifierValue(undefined);
      return;
    }

    const order = inferModTapParamOrder(behavior);
    if (!order) {
      setModTapModifierValue(undefined);
      return;
    }

    const choices = collectConstantChoices(behavior, order.modParam);
    if (choices.length === 0) {
      setModTapModifierValue(undefined);
      return;
    }

    if (modTapModifierValue === undefined) {
      setModTapModifierValue(choices[0].constant!);
      return;
    }

    if (!choices.some((c) => c.constant === modTapModifierValue)) {
      setModTapModifierValue(choices[0].constant!);
    }
  }, [modTapBehaviors, modTapBehaviorId, modTapModifierValue]);

  useEffect(() => {
    if (quickBehaviors.length === 0) {
      setQuickBehaviorId(undefined);
      return;
    }

    if (quickBehaviorId === undefined) {
      setQuickBehaviorId(quickBehaviors[0].id);
      return;
    }

    const allowed = new Set(quickBehaviors.map((b) => b.id));
    if (!allowed.has(quickBehaviorId)) {
      setQuickBehaviorId(quickBehaviors[0].id);
    }
  }, [quickBehaviors, quickBehaviorId]);

  useEffect(() => {
    if (layerTapBehaviors.length === 0) {
      setLayerTapBehaviorId(undefined);
      return;
    }

    if (layerTapBehaviorId === undefined) {
      setLayerTapBehaviorId(layerTapBehaviors[0].id);
      return;
    }

    const allowed = new Set(layerTapBehaviors.map((b) => b.id));
    if (!allowed.has(layerTapBehaviorId)) {
      setLayerTapBehaviorId(layerTapBehaviors[0].id);
    }
  }, [layerTapBehaviors, layerTapBehaviorId]);

  useEffect(() => {
    if (bluetoothBehaviorsForKind.length === 0) {
      setBluetoothBehaviorId(undefined);
      return;
    }

    if (bluetoothBehaviorId === undefined) {
      setBluetoothBehaviorId(bluetoothBehaviorsForKind[0].id);
      return;
    }

    const allowed = new Set(bluetoothBehaviorsForKind.map((b) => b.id));
    if (!allowed.has(bluetoothBehaviorId)) {
      setBluetoothBehaviorId(bluetoothBehaviorsForKind[0].id);
    }
  }, [bluetoothBehaviorsForKind, bluetoothBehaviorId]);

  useEffect(() => {
    if (modTapBehaviors.length === 0) {
      setModTapBehaviorId(undefined);
      return;
    }

    if (modTapBehaviorId === undefined) {
      setModTapBehaviorId(modTapBehaviors[0].id);
      return;
    }

    const allowed = new Set(modTapBehaviors.map((b) => b.id));
    if (!allowed.has(modTapBehaviorId)) {
      setModTapBehaviorId(modTapBehaviors[0].id);
    }
  }, [modTapBehaviors, modTapBehaviorId]);

  useEffect(() => {
    if (layerTapTargetLayerId === undefined) {
      setLayerTapTargetLayerId(layers[0]?.id);
      return;
    }

    if (!layers.some((l) => l.id === layerTapTargetLayerId)) {
      setLayerTapTargetLayerId(layers[0]?.id);
    }
  }, [layers, layerTapTargetLayerId]);

  const quickBehavior = useMemo(
    () => quickBehaviors.find((b) => b.id === quickBehaviorId),
    [quickBehaviors, quickBehaviorId]
  );
  const layerTapBehavior = useMemo(
    () => layerTapBehaviors.find((b) => b.id === layerTapBehaviorId),
    [layerTapBehaviors, layerTapBehaviorId]
  );
  const bluetoothBehavior = useMemo(
    () => bluetoothBehaviorsForKind.find((b) => b.id === bluetoothBehaviorId),
    [bluetoothBehaviorsForKind, bluetoothBehaviorId]
  );
  const modTapBehavior = useMemo(
    () => modTapBehaviors.find((b) => b.id === modTapBehaviorId),
    [modTapBehaviors, modTapBehaviorId]
  );

  const canEdit = selectedKeyPosition !== undefined && selectedBinding !== null;

  const makeKeyboardSpec = useCallback(
    (page: number, id: number, width?: number): KeySpec => {
      const label = usageLabel(page, id);
      return {
        usage: makeUsage(page, id),
        label,
        width,
        match: true,
      };
    },
    []
  );

  const makeKeyboardSpecWithLabel = useCallback(
    (page: number, id: number, label: string, width?: number): KeySpec => ({
      usage: makeUsage(page, id),
      label,
      width,
      match: true,
    }),
    []
  );

  const paletteRows = useMemo((): KeySpec[][] => {
    if (category === "main") {
      return [
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 41, "Esc", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 53, "`", 1),
          ...Array.from({ length: 10 }, (_v, i) =>
            makeKeyboardSpec(KEYBOARD_PAGE, 30 + i)
          ),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 45, "-", 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 46, "=", 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 42, "Backspace", 2),
        ],
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 43, "Tab", 1.5),
          ..."QWERTYUIOP"
            .split("")
            .map((l) => makeKeyboardSpec(KEYBOARD_PAGE, letterUsageId(l))),
          makeKeyboardSpec(KEYBOARD_PAGE, 47, 1),
          makeKeyboardSpec(KEYBOARD_PAGE, 48, 1),
          makeKeyboardSpec(KEYBOARD_PAGE, 49, 1.5),
        ],
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 57, "Caps", 1.75),
          ..."ASDFGHJKL"
            .split("")
            .map((l) => makeKeyboardSpec(KEYBOARD_PAGE, letterUsageId(l))),
          makeKeyboardSpec(KEYBOARD_PAGE, 51, 1),
          makeKeyboardSpec(KEYBOARD_PAGE, 52, 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 40, "Enter", 2.25),
        ],
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 225, "LShift", 2.25),
          ..."ZXCVBNM"
            .split("")
            .map((l) => makeKeyboardSpec(KEYBOARD_PAGE, letterUsageId(l))),
          makeKeyboardSpec(KEYBOARD_PAGE, 54, 1),
          makeKeyboardSpec(KEYBOARD_PAGE, 55, 1),
          makeKeyboardSpec(KEYBOARD_PAGE, 56, 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 229, "RShift", 2.75),
        ],
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 224, "LCtrl", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 227, "LGui", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 226, "LAlt", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 44, "Space", 6),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 230, "RAlt", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 231, "RGui", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 228, "RCtrl", 1.5),
        ],
      ];
    }

    if (category === "mods") {
      return [
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 224, "LCtrl", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 225, "LShift", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 226, "LAlt", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 227, "LGui", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 228, "RCtrl", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 229, "RShift", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 230, "RAlt", 1.5),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 231, "RGui", 1.5),
        ],
      ];
    }

    if (category === "func") {
      return [
        [
          ...Array.from({ length: 12 }, (_v, i) =>
            makeKeyboardSpec(KEYBOARD_PAGE, 58 + i)
          ),
        ],
      ];
    }

    if (category === "nav") {
      return [
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 73, "Ins", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 74, "Home", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 75, "PgUp", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 76, "Del", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 77, "End", 1.25),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 78, "PgDn", 1.25),
        ],
        [
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 80, "←", 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 81, "↓", 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 82, "↑", 1),
          makeKeyboardSpecWithLabel(KEYBOARD_PAGE, 79, "→", 1),
        ],
      ];
    }

    // media
    return [
      [
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 182, "Prev", 1.5),
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 205, "Play/Pause", 2),
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 181, "Next", 1.5),
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 183, "Stop", 1.25),
      ],
      [
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 234, "Vol−", 1.5),
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 226, "Mute", 1.5),
        makeKeyboardSpecWithLabel(CONSUMER_PAGE, 233, "Vol+", 1.5),
      ],
    ];
  }, [category, makeKeyboardSpec, makeKeyboardSpecWithLabel]);

  const allowedCategories = useMemo(() => {
    if (behaviorGroup === "key") {
      return (Object.keys(CATEGORY_LABELS) as Category[]);
    }

    const usageBehavior =
      behaviorGroup === "layerTap"
        ? layerTapBehavior
        : behaviorGroup === "modTap"
          ? modTapBehavior
          : undefined;

    if (!usageBehavior) {
      return (Object.keys(CATEGORY_LABELS) as Category[]);
    }

    const caps = getHidUsageCaps(usageBehavior);
    const supportsConsumer = (caps?.consumerMax || 0) > 0;
    return supportsConsumer
      ? (Object.keys(CATEGORY_LABELS) as Category[])
      : (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => c !== "media");
  }, [behaviorGroup, layerTapBehavior, modTapBehavior]);

  useEffect(() => {
    if (!allowedCategories.includes(category)) {
      setCategory(allowedCategories[0] || "main");
    }
  }, [allowedCategories, category]);

  const activeUsage =
    behaviorGroup === "key" && selectedBinding?.behaviorId === quickBehaviorId
      ? selectedBinding?.param1
      : undefined;
  const activeLayerTapUsage = useMemo(() => {
    if (!layerTapBehavior || selectedBinding?.behaviorId !== layerTapBehavior.id) {
      return undefined;
    }
    const order = inferLayerTapParamOrder(layerTapBehavior);
    if (!order) return undefined;
    return order.usageParam === "param1" ? selectedBinding.param1 : selectedBinding.param2;
  }, [layerTapBehavior, selectedBinding]);
  const activeModTapUsage = useMemo(() => {
    if (!modTapBehavior || selectedBinding?.behaviorId !== modTapBehavior.id) {
      return undefined;
    }
    const order = inferModTapParamOrder(modTapBehavior);
    if (!order) return undefined;
    return order.usageParam === "param1" ? selectedBinding.param1 : selectedBinding.param2;
  }, [modTapBehavior, selectedBinding]);

  const bluetoothOrder = useMemo(() => {
    if (!bluetoothBehavior) return null;
    return inferBluetoothParamOrder(bluetoothBehavior);
  }, [bluetoothBehavior]);

  const bluetoothActions = useMemo(() => {
    if (!bluetoothBehavior || !bluetoothOrder) {
      return [];
    }

    const choices = collectConstantChoices(bluetoothBehavior, bluetoothOrder.actionParam);
    const byNorm = new Map<string, BehaviorParameterValueDescription>();
    for (const c of choices) {
      byNorm.set(normalizeName(c.name), c);
    }

    return BT_ACTION_LABELS.map((label) => ({
      label,
      choice: byNorm.get(normalizeName(label)),
    }));
  }, [bluetoothBehavior, bluetoothOrder]);

  const activeBluetooth = useMemo(() => {
    if (!bluetoothBehavior || !bluetoothOrder) return null;
    if (!selectedBinding || selectedBinding.behaviorId !== bluetoothBehavior.id) return null;

    const actionValue =
      bluetoothOrder.actionParam === "param1"
        ? selectedBinding.param1
        : selectedBinding.param2;
    const profileValue =
      bluetoothOrder.profileParam === "param1"
        ? selectedBinding.param1
        : bluetoothOrder.profileParam === "param2"
          ? selectedBinding.param2
          : undefined;

    return { actionValue, profileValue };
  }, [bluetoothBehavior, bluetoothOrder, selectedBinding]);

  useEffect(() => {
    if (!bluetoothBehavior || !bluetoothOrder) {
      setBluetoothActionValue(undefined);
      setBluetoothProfileValue(undefined);
      return;
    }

    // Prefer the current binding if it uses the selected bluetooth behavior.
    if (activeBluetooth) {
      setBluetoothActionValue(activeBluetooth.actionValue);
      if (bluetoothOrder.profileParam) {
        setBluetoothProfileValue(activeBluetooth.profileValue ?? 0);
      } else {
        setBluetoothProfileValue(undefined);
      }
      return;
    }

    const firstAvailable =
      bluetoothActions.find((a) => a.choice?.constant !== undefined)?.choice
        ?.constant;
    setBluetoothActionValue(firstAvailable);
    setBluetoothProfileValue(undefined);
  }, [bluetoothBehavior, bluetoothOrder, activeBluetooth, bluetoothActions]);

  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {canEdit ? (
            <div className="text-sm">
              <span className="font-medium">Edit mode</span>
              <span className="text-base-content/60">
                {" "}
                (Layer {selectedLayerIndex + 1}, Key {selectedKeyPosition + 1})
              </span>
            </div>
          ) : (
            <div className="text-sm text-base-content/70">
              Click a key on the layout to start editing.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportKeymap(file);
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="px-3 py-1 rounded text-sm border bg-base-100 text-base-content border-base-300 hover:bg-base-300 disabled:opacity-50"
            disabled={!canImportExport}
            onClick={() => onExportKeymap()}
          >
            Export
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded text-sm border bg-base-100 text-base-content border-base-300 hover:bg-base-300 disabled:opacity-50"
            disabled={!canImportExport}
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded text-sm border bg-base-100 text-base-content border-base-300 hover:bg-base-300 disabled:opacity-50"
            disabled={!canEdit}
            onClick={onExitEditMode}
          >
            Done
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 h-full min-h-0">
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(GROUP_LABELS) as BehaviorGroup[]).map((g) => (
              <CategoryButton
                key={g}
                label={GROUP_LABELS[g]}
                active={behaviorGroup === g}
                onClick={() => setBehaviorGroup(g)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {behaviorGroup === "bluetooth" ? (
              (Object.keys(BLUETOOTH_KIND_LABELS) as BluetoothKind[]).map(
                (k) => (
                  <CategoryButton
                    key={k}
                    label={BLUETOOTH_KIND_LABELS[k]}
                    active={bluetoothKind === k}
                    onClick={() => setBluetoothKind(k)}
                  />
                )
              )
            ) : (
              (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <CategoryButton
                  key={c}
                  label={CATEGORY_LABELS[c]}
                  active={category === c}
                  disabled={!allowedCategories.includes(c)}
                  onClick={() => setCategory(c)}
                />
              ))
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {behaviorGroup === "key" ? (
              <>
                <label className="text-sm text-base-content/80">Behavior:</label>
                <select
                  className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                  value={quickBehaviorId}
                  disabled={quickBehaviors.length === 0}
                  onChange={(e) => setQuickBehaviorId(parseInt(e.target.value))}
                >
                  {quickBehaviors.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName}
                    </option>
                  ))}
                </select>
              </>
            ) : behaviorGroup === "layerTap" ? (
              <>
                <label className="text-sm text-base-content/80">
                  LT behavior:
                </label>
                <select
                  className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                  value={layerTapBehaviorId}
                  disabled={layerTapBehaviors.length === 0}
                  onChange={(e) =>
                    setLayerTapBehaviorId(parseInt(e.target.value))
                  }
                >
                  {layerTapBehaviors.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName}
                    </option>
                  ))}
                </select>
                <label className="text-sm text-base-content/80">Layer:</label>
                <select
                  className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                  value={layerTapTargetLayerId}
                  disabled={layers.length === 0}
                  onChange={(e) =>
                    setLayerTapTargetLayerId(parseInt(e.target.value))
                  }
                >
                  {layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </>
            ) : behaviorGroup === "bluetooth" ? null : behaviorGroup === "modTap" ? (
              <>
                <label className="text-sm text-base-content/80">
                  MT behavior:
                </label>
                <select
                  className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                  value={modTapBehaviorId}
                  disabled={modTapBehaviors.length === 0}
                  onChange={(e) => setModTapBehaviorId(parseInt(e.target.value))}
                >
                  {modTapBehaviors.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName}
                    </option>
                  ))}
                </select>
                {modTapBehavior &&
                  (() => {
                    const order = inferModTapParamOrder(modTapBehavior);
                    if (!order) {
                      return null;
                    }

                    const choices = collectConstantChoices(
                      modTapBehavior,
                      order.modParam
                    );
                    if (choices.length === 0) {
                      return null;
                    }

                    const current =
                      modTapModifierValue !== undefined
                        ? modTapModifierValue
                        : choices[0].constant!;

                    return (
                      <>
                        <label className="text-sm text-base-content/80">Mod:</label>
                        <select
                          className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                          value={current}
                          onChange={(e) =>
                            setModTapModifierValue(parseInt(e.target.value))
                          }
                        >
                          {choices.map((c) => (
                            <option key={c.constant!} value={c.constant!}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </>
                    );
                  })()}
              </>
            ) : (
              null
            )}
          </div>

          <div className="flex-1 min-h-0">
          {behaviorGroup === "key" && !quickBehavior ? (
            <div className="text-sm text-base-content/70">
              Quick keys are unavailable (no HID-usage based behavior found).
              Use Advanced mode.
            </div>
          ) : behaviorGroup === "layerTap" && !layerTapBehavior ? (
            <div className="text-sm text-base-content/70">
              Layer Tap is unavailable (no behavior found with both a layerId
              param and a hidUsage param). Use Advanced mode.
            </div>
          ) : behaviorGroup === "bluetooth" ? (
            (() => {
              if (!bluetoothBehavior || !bluetoothOrder) {
                return (
                  <div className="text-sm text-base-content/70">
                    Bluetooth is unavailable (no suitable behavior found). Use
                    Advanced mode.
                  </div>
                );
              }

              if (bluetoothActions.every((a) => !a.choice?.constant)) {
                return (
                  <div className="text-sm text-base-content/70">
                    Bluetooth quick picker found no options. Use Advanced mode.
                  </div>
                );
              }

              const selectedAction =
                bluetoothActionValue ??
                activeBluetooth?.actionValue ??
                bluetoothActions.find((a) => a.choice?.constant !== undefined)?.choice
                  ?.constant;

              const set =
                selectedAction !== undefined
                  ? findMetadataSetForAction(
                      bluetoothBehavior,
                      bluetoothOrder.actionParam,
                      selectedAction
                    )
                  : null;
              const profileDescs = getProfileParamDescriptors(
                set,
                bluetoothOrder.profileParam
              );
              const selectedActionName =
                selectedAction !== undefined
                  ? bluetoothActions.find(
                      (a) => a.choice?.constant === selectedAction
                    )?.label
                  : undefined;

              const wantsProfile =
                selectedActionName === "Select Profile" ||
                selectedActionName === "Clear Selected Profile";
              const fallbackProfileParam: "param1" | "param2" =
                bluetoothOrder.actionParam === "param1" ? "param2" : "param1";
              const resolvedProfileParam: "param1" | "param2" =
                bluetoothOrder.profileParam ?? fallbackProfileParam;
              const profileDescsAll =
                bluetoothOrder.profileParam && bluetoothBehavior
                  ? collectConstantChoices(bluetoothBehavior, bluetoothOrder.profileParam)
                  : [];
              const effectiveProfileDescs =
                profileDescs.length > 0 ? profileDescs : profileDescsAll;

              const needsProfile = wantsProfile || effectiveProfileDescs.length > 0;
              const effectiveProfile =
                bluetoothProfileValue ??
                defaultProfileValue(effectiveProfileDescs) ??
                0;

              const activeActionValue = activeBluetooth?.actionValue;

              return (
                <div className="h-full overflow-auto rounded border border-base-300 bg-base-100 p-2">
                  <div className="flex flex-wrap gap-2">
                    {bluetoothActions.map(({ label, choice }) => {
                      const value = choice?.constant;
                      const disabled = !canEdit || value === undefined;
                      return (
                        <KeyButton
                          key={label}
                          label={label}
                          active={value !== undefined && activeActionValue === value}
                          disabled={disabled}
                          onClick={() => {
                            if (!canEdit || value === undefined) return;

                            const param1 =
                              bluetoothOrder.actionParam === "param1"
                                ? value
                                : wantsProfile && resolvedProfileParam === "param1"
                                  ? effectiveProfile
                                  : 0;
                            const param2 =
                              bluetoothOrder.actionParam === "param2"
                                ? value
                                : wantsProfile && resolvedProfileParam === "param2"
                                  ? effectiveProfile
                                  : 0;

                            setBluetoothActionValue(value);
                            if (needsProfile) {
                              setBluetoothProfileValue(effectiveProfile);
                            } else {
                              setBluetoothProfileValue(undefined);
                            }

                            onBindingChanged({
                              behaviorId: bluetoothBehavior.id,
                              param1,
                              param2,
                            });
                          }}
                        />
                      );
                    })}
                  </div>

                  {needsProfile && (
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <label className="text-sm text-base-content/80">
                        Profile:
                      </label>
                      {effectiveProfileDescs.length === 1 &&
                      effectiveProfileDescs[0].range ? (
                        <input
                          className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content w-28"
                          type="number"
                          min={effectiveProfileDescs[0].range.min}
                          max={Math.min(effectiveProfileDescs[0].range.max, 5)}
                          value={effectiveProfile}
                          onChange={(e) => {
                            const nextProfile = parseInt(e.target.value);
                            setBluetoothProfileValue(nextProfile);
                            if (!canEdit || !wantsProfile) return;
                            if (selectedAction === undefined) return;

                            const param1 =
                              bluetoothOrder.actionParam === "param1"
                                ? selectedAction
                                : resolvedProfileParam === "param1"
                                  ? nextProfile
                                  : 0;
                            const param2 =
                              bluetoothOrder.actionParam === "param2"
                                ? selectedAction
                                : resolvedProfileParam === "param2"
                                  ? nextProfile
                                  : 0;

                            onBindingChanged({
                              behaviorId: bluetoothBehavior.id,
                              param1,
                              param2,
                            });
                          }}
                        />
                      ) : effectiveProfileDescs.length > 0 &&
                        effectiveProfileDescs.every(
                          (d) => d.constant !== undefined
                        ) ? (
                        <select
                          className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                          value={effectiveProfile}
                          onChange={(e) => {
                            const nextProfile = parseInt(e.target.value);
                            setBluetoothProfileValue(nextProfile);
                            if (!canEdit || !wantsProfile) return;
                            if (selectedAction === undefined) return;

                            const param1 =
                              bluetoothOrder.actionParam === "param1"
                                ? selectedAction
                                : resolvedProfileParam === "param1"
                                  ? nextProfile
                                  : 0;
                            const param2 =
                              bluetoothOrder.actionParam === "param2"
                                ? selectedAction
                                : resolvedProfileParam === "param2"
                                  ? nextProfile
                                  : 0;

                            onBindingChanged({
                              behaviorId: bluetoothBehavior.id,
                              param1,
                              param2,
                            });
                          }}
                        >
                          {effectiveProfileDescs.map((d) => (
                            <option key={d.constant!} value={d.constant!}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : wantsProfile ? (
                        <select
                          className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                          value={effectiveProfile}
                          onChange={(e) => {
                            const nextProfile = parseInt(e.target.value);
                            setBluetoothProfileValue(nextProfile);
                            if (!canEdit) return;
                            if (selectedAction === undefined) return;

                            const param1 =
                              bluetoothOrder.actionParam === "param1"
                                ? selectedAction
                                : resolvedProfileParam === "param1"
                                  ? nextProfile
                                  : 0;
                            const param2 =
                              bluetoothOrder.actionParam === "param2"
                                ? selectedAction
                                : resolvedProfileParam === "param2"
                                  ? nextProfile
                                  : 0;

                            onBindingChanged({
                              behaviorId: bluetoothBehavior.id,
                              param1,
                              param2,
                            });
                          }}
                        >
                          {Array.from({ length: 6 }, (_v, i) => i).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-base-content/70">
                          (Profile input not supported)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          ) : behaviorGroup === "modTap" && (!modTapBehavior || modTapModifierValue === undefined) ? (
            <div className="text-sm text-base-content/70">
              Mod-tap is unavailable (no suitable behavior/modifier found). Use
              Advanced mode.
            </div>
          ) : behaviorGroup === "other" ? (
            <div className="rounded border border-base-300 bg-base-100 p-2">
              {selectedBinding ? (
                <BehaviorBindingPicker
                  binding={selectedBinding}
                  behaviors={Object.values(behaviors)}
                  layers={layers}
                  onBindingChanged={onBindingChanged}
                />
              ) : (
                <div className="text-sm text-base-content/70">
                  Select a key to edit.
                </div>
              )}
            </div>
          ) : behaviorGroup !== "key" && behaviorGroup !== "layerTap" && behaviorGroup !== "modTap" ? (
            <div className="text-sm text-base-content/70">
              No quick palette for this group yet. Use Advanced mode.
            </div>
          ) : (
            <div className="h-full overflow-auto rounded border border-base-300 bg-base-100 p-2">
              <KeyboardPalette
                rows={paletteRows}
                activeUsage={
                  behaviorGroup === "key"
                    ? activeUsage
                    : behaviorGroup === "layerTap"
                      ? activeLayerTapUsage
                      : activeModTapUsage
                }
                disabled={!canEdit}
                onUsageClicked={(usage) => {
                  if (!canEdit) return;

                  if (behaviorGroup === "key") {
                    if (!quickBehavior) return;
                    onBindingChanged({
                      behaviorId: quickBehavior.id,
                      param1: usage,
                      param2: 0,
                    });
                    return;
                  }

                  if (
                    behaviorGroup !== "layerTap" ||
                    !layerTapBehavior ||
                    layerTapTargetLayerId === undefined
                  ) {
                    // fallthrough for mod-tap
                  } else {
                    const order = inferLayerTapParamOrder(layerTapBehavior);
                    if (!order) {
                      return;
                    }

                    const binding: BehaviorBinding =
                      order.layerParam === "param1"
                        ? {
                            behaviorId: layerTapBehavior.id,
                            param1: layerTapTargetLayerId,
                            param2: usage,
                          }
                        : {
                            behaviorId: layerTapBehavior.id,
                            param1: usage,
                            param2: layerTapTargetLayerId,
                          };

                    onBindingChanged(binding);
                    return;
                  }

                  if (behaviorGroup !== "modTap" || !modTapBehavior) {
                    return;
                  }

                  const order = inferModTapParamOrder(modTapBehavior);
                  if (!order) return;

                  const choices = collectConstantChoices(
                    modTapBehavior,
                    order.modParam
                  );
                  if (choices.length === 0) return;

                  const modValue =
                    modTapModifierValue !== undefined
                      ? modTapModifierValue
                      : choices[0].constant!;

                  onBindingChanged({
                    behaviorId: modTapBehavior.id,
                    param1: order.modParam === "param1" ? modValue : usage,
                    param2: order.modParam === "param2" ? modValue : usage,
                  });
                }}
              />
            </div>
          )}
          </div>
        </div>
    </div>
  );
}
