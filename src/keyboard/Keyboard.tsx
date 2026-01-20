import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Request } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "../rpc/logging";
import {
  PhysicalLayout,
  Keymap,
  SetLayerBindingResponse,
  SetLayerPropsResponse,
  BehaviorBinding,
  Layer,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { LayerPicker } from "./LayerPicker";
import { PhysicalLayoutPicker } from "./PhysicalLayoutPicker";
import { Keymap as KeymapComp } from "./Keymap";
import { findKeyPositionsByHidUsage, keyboardCodeToHidUsage } from "./keyTester";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { produce } from "immer";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { deserializeLayoutZoom, LayoutZoom } from "./PhysicalLayout";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { KeyAssignPanel } from "./KeyAssignPanel";
import { HidUsageLabel } from "./HidUsageLabel";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

function useBehaviors(): BehaviorMap {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [behaviors, setBehaviors] = useState<BehaviorMap>({});

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setBehaviors({});
      return;
    }

    async function startRequest() {
      setBehaviors({});

      if (!connection.conn) {
        return;
      }

      let get_behaviors: Request = {
        behaviors: { listAllBehaviors: true },
        requestId: 0,
      };

      let behavior_list = await call_rpc(connection.conn, get_behaviors);
      if (!ignore) {
        let behavior_map: BehaviorMap = {};
        for (let behaviorId of behavior_list.behaviors?.listAllBehaviors
          ?.behaviors || []) {
          if (ignore) {
            break;
          }
          let details_req = {
            behaviors: { getBehaviorDetails: { behaviorId } },
            requestId: 0,
          };
          let behavior_details = await call_rpc(connection.conn, details_req);
          let dets: GetBehaviorDetailsResponse | undefined =
            behavior_details?.behaviors?.getBehaviorDetails;

          if (dets) {
            behavior_map[dets.id] = dets;
          }
        }

        if (!ignore) {
          setBehaviors(behavior_map);
        }
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return behaviors;
}

function useLayouts(): [
  PhysicalLayout[] | undefined,
  React.Dispatch<SetStateAction<PhysicalLayout[] | undefined>>,
  number,
  React.Dispatch<SetStateAction<number>>
] {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [layouts, setLayouts] = useState<PhysicalLayout[] | undefined>(
    undefined
  );
  const [selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex] =
    useState<number>(0);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayouts(undefined);
      return;
    }

    async function startRequest() {
      setLayouts(undefined);

      if (!connection.conn) {
        return;
      }

      let response = await call_rpc(connection.conn, {
        keymap: { getPhysicalLayouts: true },
      });

      if (!ignore) {
        setLayouts(response?.keymap?.getPhysicalLayouts?.layouts);
        setSelectedPhysicalLayoutIndex(
          response?.keymap?.getPhysicalLayouts?.activeLayoutIndex || 0
        );
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return [
    layouts,
    setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ];
}

export default function Keyboard() {
  const lockState = useContext(LockStateContext);
  const [showKeyTester, setShowKeyTester] = useState(false);
  const [testerPressedUsages, setTesterPressedUsages] = useState<number[]>([]);
  const [testerHitUsages, setTesterHitUsages] = useState<Set<number>>(
    () => new Set()
  );
  const [testerEvents, setTesterEvents] = useState<
    {
      kind: "down" | "up";
      code: string;
      key: string;
      usage: number | null;
      at: number;
    }[]
  >([]);
  const [
    layouts,
    _setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ] = useLayouts();
  const [keymap, setKeymap] = useConnectedDeviceData<Keymap>(
    { keymap: { getKeymap: true } },
    (keymap) => {
      console.log("Got the keymap!");
      return keymap?.keymap?.getKeymap;
    },
    true
  );

  const [keymapScale, setKeymapScale] = useLocalStorageState<LayoutZoom>("keymapScale", "auto", {
    deserialize: deserializeLayoutZoom,
  });

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);
  const behaviors = useBehaviors();

  const conn = useContext(ConnectionContext);
  const undoRedo = useContext(UndoRedoContext);

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
  }, [conn]);

  const exportKeymap = useCallback(() => {
    if (!keymap) {
      return;
    }

    const payload = {
      format: "zmk-studio-keymap",
      version: 1,
      exportedAt: new Date().toISOString(),
      keymap: {
        layers: keymap.layers.map((l) => ({
          name: l.name,
          bindings: l.bindings.map((b) => ({
            behaviorId: b.behaviorId,
            param1: b.param1,
            param2: b.param2,
          })),
        })),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zmk-studio-keymap.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [keymap]);

  const importKeymap = useCallback(
    async (file: File) => {
      if (!conn.conn) {
        window.alert("Not connected");
        return;
      }
      if (lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
        window.alert("Unlock the device to import a keymap");
        return;
      }
      if (!keymap) {
        window.alert("Keymap not loaded yet");
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        window.alert("Invalid JSON file");
        return;
      }

      const importedLayers =
        parsed?.keymap?.layers || parsed?.layers || parsed?.keymap?.getKeymap?.layers;
      if (!Array.isArray(importedLayers) || importedLayers.length === 0) {
        window.alert("Invalid keymap format (missing layers)");
        return;
      }

      const maxLayers = Math.min(keymap.layers.length, importedLayers.length);

      for (let layerIndex = 0; layerIndex < maxLayers; layerIndex++) {
        const layerId = keymap.layers[layerIndex].id;
        const currentBindings = keymap.layers[layerIndex].bindings;
        const nextBindings = importedLayers[layerIndex]?.bindings;
        if (!Array.isArray(nextBindings)) {
          continue;
        }

        const maxKeys = Math.min(currentBindings.length, nextBindings.length);
        for (let keyPosition = 0; keyPosition < maxKeys; keyPosition++) {
          const oldBinding = currentBindings[keyPosition];
          const nextBinding = nextBindings[keyPosition];
          if (!nextBinding) continue;

          const binding = {
            behaviorId: nextBinding.behaviorId ?? 0,
            param1: nextBinding.param1 ?? 0,
            param2: nextBinding.param2 ?? 0,
          };

          if (
            oldBinding.behaviorId === binding.behaviorId &&
            oldBinding.param1 === binding.param1 &&
            oldBinding.param2 === binding.param2
          ) {
            continue;
          }

          const resp = await call_rpc(conn.conn, {
            keymap: { setLayerBinding: { layerId, keyPosition, binding } },
          });

          if (
            resp.keymap?.setLayerBinding !==
            SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
          ) {
            console.error("Failed to set binding", resp.keymap?.setLayerBinding);
            window.alert("Failed to import keymap (setLayerBinding error)");
            return;
          }

          setKeymap(
            produce((draft: any) => {
              draft.layers[layerIndex].bindings[keyPosition] = binding;
            })
          );
        }
      }
    },
    [conn, lockState, keymap, setKeymap]
  );

  useEffect(() => {
    async function performSetRequest() {
      if (!conn.conn || !layouts) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { setActivePhysicalLayout: selectedPhysicalLayoutIndex },
      });

      let new_keymap = resp?.keymap?.setActivePhysicalLayout?.ok;
      if (new_keymap) {
        setKeymap(new_keymap);
      } else {
        console.error(
          "Failed to set the active physical layout err:",
          resp?.keymap?.setActivePhysicalLayout?.err
        );
      }
    }

    performSetRequest();
  }, [selectedPhysicalLayoutIndex]);

  let doSelectPhysicalLayout = useCallback(
    (i: number) => {
      let oldLayout = selectedPhysicalLayoutIndex;
      undoRedo?.(async () => {
        setSelectedPhysicalLayoutIndex(i);

        return async () => {
          setSelectedPhysicalLayoutIndex(oldLayout);
        };
      });
    },
    [undoRedo, selectedPhysicalLayoutIndex]
  );

  let doUpdateBinding = useCallback(
    (binding: BehaviorBinding) => {
      if (!keymap || selectedKeyPosition === undefined) {
        console.error(
          "Can't update binding without a selected key position and loaded keymap"
        );
        return;
      }

      const layer = selectedLayerIndex;
      const layerId = keymap.layers[layer].id;
      const keyPosition = selectedKeyPosition;
      const oldBinding = keymap.layers[layer].bindings[keyPosition];
      undoRedo?.(async () => {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { setLayerBinding: { layerId, keyPosition, binding } },
        });

        if (
          resp.keymap?.setLayerBinding ===
          SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              draft.layers[layer].bindings[keyPosition] = binding;
            })
          );
        } else {
          console.error("Failed to set binding", resp.keymap?.setLayerBinding);
        }

        return async () => {
          if (!conn.conn) {
            return;
          }

          let resp = await call_rpc(conn.conn, {
            keymap: {
              setLayerBinding: { layerId, keyPosition, binding: oldBinding },
            },
          });
          if (
            resp.keymap?.setLayerBinding ===
            SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
          ) {
            setKeymap(
              produce((draft: any) => {
                draft.layers[layer].bindings[keyPosition] = oldBinding;
              })
            );
          } else {
          }
        };
      });
    },
    [conn, keymap, undoRedo, selectedLayerIndex, selectedKeyPosition]
  );

  let selectedBinding = useMemo(() => {
    if (
      keymap == null ||
      selectedKeyPosition == null ||
      !keymap.layers[selectedLayerIndex]
    ) {
      return null;
    }

    return keymap.layers[selectedLayerIndex].bindings[selectedKeyPosition];
  }, [keymap, selectedLayerIndex, selectedKeyPosition]);

  const moveLayer = useCallback(
    (start: number, end: number) => {
      const doMove = async (startIndex: number, destIndex: number) => {
        if (!conn.conn) {
          return;
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { moveLayer: { startIndex, destIndex } },
        });

        if (resp.keymap?.moveLayer?.ok) {
          setKeymap(resp.keymap?.moveLayer?.ok);
          setSelectedLayerIndex(destIndex);
        } else {
          console.error("Error moving", resp);
        }
      };

      undoRedo?.(async () => {
        await doMove(start, end);
        return () => doMove(end, start);
      });
    },
    [undoRedo]
  );

  const addLayer = useCallback(() => {
    async function doAdd(): Promise<number> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });

      if (resp.keymap?.addLayer?.ok) {
        const newSelection = keymap.layers.length;
        setKeymap(
          produce((draft: any) => {
            draft.layers.push(resp.keymap!.addLayer!.ok!.layer);
            draft.availableLayers--;
          })
        );

        setSelectedLayerIndex(newSelection);

        return resp.keymap.addLayer.ok.index;
      } else {
        console.error("Add error", resp.keymap?.addLayer?.err);
        throw new Error("Failed to add layer:" + resp.keymap?.addLayer?.err);
      }
    }

    async function doRemove(layerIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      console.log(resp);
      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    undoRedo?.(async () => {
      let index = await doAdd();
      return () => doRemove(index);
    });
  }, [conn, undoRedo, keymap]);

  const removeLayer = useCallback(() => {
    async function doRemove(layerIndex: number): Promise<void> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        if (layerIndex == keymap.layers.length - 1) {
          setSelectedLayerIndex(layerIndex - 1);
        }
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    async function doRestore(layerId: number, atIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { restoreLayer: { layerId, atIndex } },
      });

      console.log(resp);
      if (resp.keymap?.restoreLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(atIndex, 0, resp!.keymap!.restoreLayer!.ok);
            draft.availableLayers--;
          })
        );
        setSelectedLayerIndex(atIndex);
      } else {
        console.error("Remove error", resp.keymap?.restoreLayer?.err);
        throw new Error(
          "Failed to restore layer:" + resp.keymap?.restoreLayer?.err
        );
      }
    }

    if (!keymap) {
      throw new Error("No keymap loaded");
    }

    let index = selectedLayerIndex;
    let layerId = keymap.layers[index].id;
    undoRedo?.(async () => {
      await doRemove(index);
      return () => doRestore(layerId, index);
    });
  }, [conn, undoRedo, selectedLayerIndex]);

  const changeLayerName = useCallback(
    (id: number, oldName: string, newName: string) => {
      async function changeName(layerId: number, name: string) {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerProps: { layerId, name } },
        });

        if (
          resp.keymap?.setLayerProps ==
          SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              const layer_index = draft.layers.findIndex(
                (l: Layer) => l.id == layerId
              );
              draft.layers[layer_index].name = name;
            })
          );
        } else {
          throw new Error(
            "Failed to change layer name:" + resp.keymap?.setLayerProps
          );
        }
      }

      undoRedo?.(async () => {
        await changeName(id, newName);
        return async () => {
          await changeName(id, oldName);
        };
      });
    },
    [conn, undoRedo, keymap]
  );

  useEffect(() => {
    if (!keymap?.layers) return;

    const layers = keymap.layers.length - 1;

    if (selectedLayerIndex > layers) {
      setSelectedLayerIndex(layers);
    }
  }, [keymap, selectedLayerIndex]);

  useEffect(() => {
    if (!showKeyTester) {
      setTesterPressedUsages([]);
      setTesterHitUsages(new Set());
      setTesterEvents([]);
      return;
    }

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!showKeyTester) return;
      if (isTypingTarget(e.target)) return;
      if (e.repeat) return;
      const usage = keyboardCodeToHidUsage(e.code);
      e.preventDefault();
      e.stopPropagation();

      if (usage !== null) {
        setTesterPressedUsages((prev) =>
          prev.includes(usage) ? prev : [...prev, usage]
        );
        setTesterHitUsages((prev) => {
          if (prev.has(usage)) return prev;
          const next = new Set(prev);
          next.add(usage);
          return next;
        });
      }

      setTesterEvents((prev) =>
        [
          { kind: "down" as const, code: e.code, key: e.key, usage, at: Date.now() },
          ...prev,
        ].slice(0, 30)
      );
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!showKeyTester) return;
      if (isTypingTarget(e.target)) return;
      const usage = keyboardCodeToHidUsage(e.code);
      e.preventDefault();
      e.stopPropagation();

      if (usage !== null) {
        setTesterPressedUsages((prev) => prev.filter((u) => u !== usage));
      }

      setTesterEvents((prev) =>
        [
          { kind: "up" as const, code: e.code, key: e.key, usage, at: Date.now() },
          ...prev,
        ].slice(0, 30)
      );
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
      window.removeEventListener("keyup", onKeyUp, { capture: true } as any);
    };
  }, [showKeyTester]);

  const highlightedKeyPositions = useMemo(() => {
    if (!showKeyTester || !keymap || !behaviors) return undefined;
    const bindings = keymap.layers[selectedLayerIndex]?.bindings || [];
    const positions = new Set<number>();
    const combinedUsages = new Set<number>(testerHitUsages);
    for (const usage of testerPressedUsages) combinedUsages.add(usage);
    for (const usage of combinedUsages) {
      for (const pos of findKeyPositionsByHidUsage({
        keymapBindings: bindings,
        behaviors,
        usage,
      })) {
        positions.add(pos);
      }
    }
    return positions;
  }, [
    showKeyTester,
    keymap,
    behaviors,
    selectedLayerIndex,
    testerPressedUsages,
    testerHitUsages,
  ]);

  const testerLogLines = useMemo(() => {
    if (!showKeyTester) return [];
    const max = 12;
    const lines = testerEvents.slice(0, max).reverse(); // oldest -> newest
    return lines.map((ev, idx) => {
      const age = lines.length - 1 - idx; // 0 newest
      const opacity = Math.max(0.08, 0.35 - age * 0.03);
      return { ev, idx, opacity };
    });
  }, [showKeyTester, testerEvents]);

  const resetKeyTester = useCallback(() => {
    setTesterPressedUsages([]);
    setTesterHitUsages(new Set());
    setTesterEvents([]);
  }, []);

  return (
    <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_32rem] bg-base-300 max-w-full min-w-0 min-h-0">
      <div className="p-2 flex flex-col gap-2 bg-base-200 row-span-2">
        {layouts && (
          <div className="col-start-3 row-start-1 row-end-2">
            <PhysicalLayoutPicker
              layouts={layouts}
              selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
              onPhysicalLayoutClicked={doSelectPhysicalLayout}
            />
          </div>
        )}

        {keymap && (
          <div className="col-start-1 row-start-1 row-end-2">
            <LayerPicker
              layers={keymap.layers}
              selectedLayerIndex={selectedLayerIndex}
              onLayerClicked={setSelectedLayerIndex}
              onLayerMoved={moveLayer}
              canAdd={(keymap.availableLayers || 0) > 0}
              canRemove={(keymap.layers?.length || 0) > 1}
              onAddClicked={addLayer}
              onRemoveClicked={removeLayer}
              onLayerNameChanged={changeLayerName}
            />
          </div>
        )}

        <button
          type="button"
          className="px-3 py-2 rounded text-sm border bg-base-100 text-base-content border-base-300 hover:bg-base-300"
          onClick={() => setShowKeyTester((v) => !v)}
        >
          Key Tester {showKeyTester ? "(On)" : "(Off)"}
        </button>
        {showKeyTester && (
          <button
            type="button"
            className="px-3 py-2 rounded text-sm border bg-base-100 text-base-content border-base-300 hover:bg-base-300"
            onClick={resetKeyTester}
          >
            Reset highlights
          </button>
        )}
      </div>
      {layouts && keymap && behaviors && (
        <div className="p-2 col-start-2 row-start-1 grid items-center justify-center relative min-w-0">
          {showKeyTester && (
            <div className="absolute inset-0 pointer-events-none z-0">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-[64px] font-bold tracking-widest text-base-content/5 select-none">
                  TESTER MODE
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex justify-between gap-6">
                <div className="text-sm text-base-content/30">
                  Key tester enabled
                </div>
                <div className="text-xs text-base-content/30">
                  Press keys to highlight mapped positions
                </div>
              </div>
              <div className="absolute bottom-10 left-3">
                <div className="flex flex-col gap-1">
                  {testerLogLines.map(({ ev, idx, opacity }) => (
                    <div
                      key={`${ev.at}-${idx}`}
                      className="text-sm font-mono select-none"
                      style={{ opacity }}
                    >
                      <span className="inline-block w-7 opacity-80">
                        {ev.kind === "down" ? "down" : "up"}
                      </span>
                      <span className="inline-block w-36">
                        {ev.code}
                      </span>
                      <span className="inline-block w-16 opacity-80">
                        {ev.key}
                      </span>
                      <span className="opacity-90">
                        {ev.usage !== null ? (
                          <HidUsageLabel hid_usage={ev.usage} />
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="relative z-10">
          <KeymapComp
            keymap={keymap}
            layout={layouts[selectedPhysicalLayoutIndex]}
            behaviors={behaviors}
            scale={keymapScale}
            selectedLayerIndex={selectedLayerIndex}
            selectedKeyPosition={selectedKeyPosition}
            highlightedKeyPositions={highlightedKeyPositions}
            onKeyPositionClicked={setSelectedKeyPosition}
          />
          </div>
          <select
            className="absolute top-2 right-2 z-20 h-8 rounded px-2"
            value={keymapScale}
            onChange={(e) => {
              const value = deserializeLayoutZoom(e.target.value);
              setKeymapScale(value);
            }}
          >
            <option value="auto">Auto</option>
            <option value={0.25}>25%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </div>
      )}
      {keymap && behaviors && (
        <div className="p-2 col-start-2 row-start-2 bg-base-200 min-w-0 h-full overflow-hidden">
          <KeyAssignPanel
            selectedKeyPosition={selectedKeyPosition}
            selectedLayerIndex={selectedLayerIndex}
            selectedBinding={selectedBinding}
            behaviors={behaviors}
            layers={keymap.layers.map(({ id, name }, li) => ({
              id,
              name: name || li.toLocaleString(),
            }))}
            onExitEditMode={() => setSelectedKeyPosition(undefined)}
            onBindingChanged={doUpdateBinding}
            canImportExport={
              !!conn.conn &&
              !!keymap &&
              lockState == LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
            }
            onExportKeymap={exportKeymap}
            onImportKeymap={importKeymap}
          />
        </div>
      )}
    </div>
  );
}
