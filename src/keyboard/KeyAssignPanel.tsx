import { useCallback, useEffect, useMemo, useState } from "react";

import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { hid_usage_get_labels, hid_usage_from_page_and_id } from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

type Mode = "quick" | "advanced";
type QuickKind = "key" | "layerTap";
type Category = "main" | "mods" | "nav" | "func" | "media";

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
    .flatMap((set) => set.param1 || [])
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

function getQuickLayerTapBehaviors(behaviors: BehaviorMap) {
  return Object.values(behaviors).filter((b) => hasLayerIdParam(b) && hasHidUsageParam(b));
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

function findBehaviorIdByName(
  behaviors: BehaviorMap,
  displayName: string
): number | undefined {
  return Object.values(behaviors).find((b) => b.displayName === displayName)?.id;
}

const CATEGORY_LABELS: Record<Category, string> = {
  main: "Main",
  mods: "Mods",
  nav: "Nav",
  func: "Func",
  media: "Media",
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
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "px-3 py-1 rounded text-sm border",
        active
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
}: {
  selectedKeyPosition: number | undefined;
  selectedLayerIndex: number;
  selectedBinding: BehaviorBinding | null;
  behaviors: BehaviorMap;
  layers: { id: number; name: string }[];
  onExitEditMode: () => void;
  onBindingChanged: (binding: BehaviorBinding) => void;
}) {
  const [mode, setMode] = useState<Mode>("quick");
  const [quickKind, setQuickKind] = useState<QuickKind>("key");
  const [category, setCategory] = useState<Category>("main");
  const [filter, setFilter] = useState("");
  const [quickBehaviorId, setQuickBehaviorId] = useState<number | undefined>(
    undefined
  );
  const [layerTapBehaviorId, setLayerTapBehaviorId] = useState<
    number | undefined
  >(undefined);
  const [layerTapTargetLayerId, setLayerTapTargetLayerId] = useState<
    number | undefined
  >(layers[0]?.id);

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
      setQuickKind("layerTap");
    }
  }, [selectedBinding, layerTapBehaviorId, layerTapBehaviors, layers]);

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
  const transparentBehaviorId = useMemo(
    () => findBehaviorIdByName(behaviors, "Transparent"),
    [behaviors]
  );

  const canEdit = selectedKeyPosition !== undefined && selectedBinding !== null;

  const filterNormalized = filter.trim().toLowerCase();
  const matchesFilter = useMemo(() => {
    return (label: string) =>
      filterNormalized.length === 0 ||
      label.toLowerCase().includes(filterNormalized);
  }, [filterNormalized]);

  const makeKeyboardSpec = useCallback(
    (page: number, id: number, width?: number): KeySpec => {
      const label = usageLabel(page, id);
      return {
        usage: makeUsage(page, id),
        label,
        width,
        match: matchesFilter(label),
      };
    },
    [matchesFilter]
  );

  const makeKeyboardSpecWithLabel = useCallback(
    (page: number, id: number, label: string, width?: number): KeySpec => ({
      usage: makeUsage(page, id),
      label,
      width,
      match: matchesFilter(label),
    }),
    [matchesFilter]
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
    if (quickKind === "key") {
      return (Object.keys(CATEGORY_LABELS) as Category[]);
    }

    if (!layerTapBehavior) {
      return (Object.keys(CATEGORY_LABELS) as Category[]);
    }

    const caps = getHidUsageCaps(layerTapBehavior);
    const supportsConsumer = (caps?.consumerMax || 0) > 0;
    return supportsConsumer
      ? (Object.keys(CATEGORY_LABELS) as Category[])
      : (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => c !== "media");
  }, [quickKind, layerTapBehavior]);

  useEffect(() => {
    if (!allowedCategories.includes(category)) {
      setCategory(allowedCategories[0] || "main");
    }
  }, [allowedCategories, category]);

  const activeUsage =
    quickKind === "key" && selectedBinding?.behaviorId === quickBehaviorId
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

  return (
    <div className="flex flex-col gap-2">
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
          <button
            type="button"
            className={[
              "px-3 py-1 rounded text-sm border",
              mode === "quick"
                ? "bg-primary text-primary-content border-primary"
                : "bg-base-100 text-base-content border-base-300 hover:bg-base-300",
            ].join(" ")}
            onClick={() => setMode("quick")}
          >
            Quick
          </button>
          <button
            type="button"
            className={[
              "px-3 py-1 rounded text-sm border",
              mode === "advanced"
                ? "bg-primary text-primary-content border-primary"
                : "bg-base-100 text-base-content border-base-300 hover:bg-base-300",
            ].join(" ")}
            onClick={() => setMode("advanced")}
          >
            Advanced
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

      {mode === "quick" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryButton
              label="Key"
              active={quickKind === "key"}
              onClick={() => setQuickKind("key")}
            />
            <CategoryButton
              label="Layer Tap"
              active={quickKind === "layerTap"}
              onClick={() => setQuickKind("layerTap")}
            />

            {allowedCategories.map((c) => (
              <CategoryButton
                key={c}
                label={CATEGORY_LABELS[c]}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            ))}

            {quickKind === "key" ? (
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
            ) : (
              <>
                <label className="text-sm text-base-content/80">
                  LT behavior:
                </label>
                <select
                  className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
                  value={layerTapBehaviorId}
                  disabled={layerTapBehaviors.length === 0}
                  onChange={(e) => setLayerTapBehaviorId(parseInt(e.target.value))}
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
            )}

            <input
              className="h-8 px-2 rounded border border-base-300 bg-base-100 text-base-content"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {transparentBehaviorId !== undefined && (
              <KeyButton
                label="Transparent"
                disabled={!canEdit}
                onClick={() => {
                  if (!canEdit) return;
                  onBindingChanged({
                    behaviorId: transparentBehaviorId,
                    param1: 0,
                    param2: 0,
                  });
                }}
              />
            )}
          </div>

          {quickKind === "key" && !quickBehavior ? (
            <div className="text-sm text-base-content/70">
              Quick keys are unavailable (no HID-usage based behavior found).
              Use Advanced mode.
            </div>
          ) : quickKind === "layerTap" && !layerTapBehavior ? (
            <div className="text-sm text-base-content/70">
              Layer Tap is unavailable (no behavior found with both a layerId
              param and a hidUsage param). Use Advanced mode.
            </div>
          ) : (
            <div className="max-h-44 overflow-auto rounded border border-base-300 bg-base-100 p-2">
              <KeyboardPalette
                rows={paletteRows}
                activeUsage={
                  quickKind === "key" ? activeUsage : activeLayerTapUsage
                }
                disabled={!canEdit}
                onUsageClicked={(usage) => {
                  if (!canEdit) return;

                  if (quickKind === "key") {
                    if (!quickBehavior) return;
                    onBindingChanged({
                      behaviorId: quickBehavior.id,
                      param1: usage,
                      param2: 0,
                    });
                    return;
                  }

                  if (!layerTapBehavior || layerTapTargetLayerId === undefined) {
                    return;
                  }

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
                }}
              />
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
