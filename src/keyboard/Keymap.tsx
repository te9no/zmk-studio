import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import { hid_usage_get_labels, hid_usage_page_and_id_from_usage } from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

const BT_ACTION_LABELS = [
  "Next Profile",
  "Previous Profile",
  "Clear All Profiles",
  "Clear Selected Profile",
  "Select Profile",
  "Disconnect Profile",
] as const;

function removeKeyboardPrefix(label?: string) {
  return label?.replace(/^Keyboard\s+/, "") || "";
}

function compactLabel(label: string) {
  return label.replace(/\s+/g, "");
}

function abbreviateBluetoothBehavior(displayName: string) {
  const n = normalizeName(displayName);
  if (n.includes("output")) return "Out";
  if (n.includes("bluetooth")) return "BT";
  return "BT";
}

function abbreviateBluetoothAction(action?: string) {
  switch (action) {
    case "Next Profile":
      return "NextProf";
    case "Previous Profile":
      return "PrevProf";
    case "Clear All Profiles":
      return "ClrAll";
    case "Clear Selected Profile":
      return "ClrSel";
    case "Select Profile":
      return "SelProf";
    case "Disconnect Profile":
      return "DiscProf";
    default:
      return action ? compactLabel(action) : "Action";
  }
}

function truncateMiddle(s: string, max: number) {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
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

  return null;
}

function constantLabelForValue(
  behavior: GetBehaviorDetailsResponse,
  param: "param1" | "param2",
  value: number
): string | undefined {
  for (const set of behavior.metadata || []) {
    const arr = (param === "param1" ? set.param1 : set.param2) || [];
    const found = arr.find((d) => d.constant === value);
    if (found?.name) {
      return found.name;
    }
  }
  return undefined;
}

function HidUsageInline({ usage }: { usage: number }) {
  const [pageRaw, id] = hid_usage_page_and_id_from_usage(usage);
  let page = pageRaw;
  page &= 0xff;
  const labels = hid_usage_get_labels(page, id);
  return <span>{removeKeyboardPrefix(labels.short)}</span>;
}

function KeyPreview({
  behavior,
  binding,
  keymap,
}: {
  behavior: GetBehaviorDetailsResponse | undefined;
  binding: BehaviorBinding;
  keymap: KeymapMsg;
}) {
  if (!behavior) {
    return <></>;
  }

  // Bluetooth-like behaviors: show behavior/action/profile
  if (/bluetooth|output/i.test(behavior.displayName) && hasConstantParam(behavior)) {
    const order = inferBluetoothParamOrder(behavior);
    if (order) {
      const actionValue = order.actionParam === "param1" ? binding.param1 : binding.param2;
      const actionName = constantLabelForValue(behavior, order.actionParam, actionValue);
      const wantsProfile = actionName === "Select Profile";
      const fallbackProfileParam =
        order.actionParam === "param1" ? ("param2" as const) : ("param1" as const);
      const resolvedProfileParam = order.profileParam ?? fallbackProfileParam;
      const profileValue =
        resolvedProfileParam === "param1" ? binding.param1 : binding.param2;

      return (
        <div className="flex flex-col items-center justify-center text-[10px] leading-[1.1] text-center">
          <div className="font-medium">
            {abbreviateBluetoothBehavior(behavior.displayName)}
          </div>
          <div className="opacity-90">{abbreviateBluetoothAction(actionName)}</div>
          {wantsProfile && <div className="opacity-90">{profileValue}</div>}
        </div>
      );
    }
  }

  // Layer-tap: show Layer-Tap / layer name / tap key
  if (hasLayerIdParam(behavior) && hasHidUsageParam(behavior)) {
    const order = inferLayerTapParamOrder(behavior);
    if (order) {
      const layerId = order.layerParam === "param1" ? binding.param1 : binding.param2;
      const tapUsage = order.usageParam === "param1" ? binding.param1 : binding.param2;
      const layer = keymap.layers.find((l) => l.id === layerId);
      const layerName =
        layer?.name ||
        (layer ? `${keymap.layers.indexOf(layer)}` : layerId.toString());

      return (
        <div className="flex flex-col items-center justify-center text-[10px] leading-[1.1] text-center">
          <div className="font-medium">LT</div>
          <div className="opacity-90">{truncateMiddle(layerName, 8)}</div>
          <div className="opacity-90">
            <HidUsageInline usage={tapUsage} />
          </div>
        </div>
      );
    }
  }

  // Fallback: old behavior header + simple usage label if present.
  if (hasHidUsageParam(behavior)) {
    return <HidUsageLabel hid_usage={binding.param1} />;
  }

  return <></>;
}

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  highlightedKeyPositions?: Set<number>;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  highlightedKeyPositions,
  onKeyPositionClicked,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const behavior = behaviors[binding.behaviorId];
    const isLayerTap =
      behavior ? hasLayerIdParam(behavior) && hasHidUsageParam(behavior) : false;
    const isBluetoothLike = behavior
      ? /bluetooth|output/i.test(behavior.displayName)
      : false;

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header:
        isLayerTap || isBluetoothLike ? "" : behavior?.displayName || "Unknown",
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: <KeyPreview behavior={behavior} binding={binding} keymap={keymap} />,
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      highlightedPositions={highlightedKeyPositions}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
