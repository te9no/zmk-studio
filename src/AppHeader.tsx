import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { useConnectedDeviceData } from "./rpc/useConnectedDeviceData";
import { useSub } from "./usePubSub";
import { useContext, useEffect, useState } from "react";
import { useModalRef } from "./misc/useModalRef";
import { LockStateContext } from "./rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./rpc/ConnectionContext";
import {
  ChevronDown,
  Monitor,
  Moon,
  Palette,
  Sun,
  Undo2,
  Redo2,
  Save,
  Trash2,
} from "lucide-react";
import { Tooltip } from "./misc/Tooltip";
import { GenericModal } from "./GenericModal";
import { useLocalStorageState } from "./misc/useLocalStorageState";
import {
  applyColorSchemePreference,
  ColorSchemePreference,
  parseColorSchemePreference,
} from "./misc/colorScheme";
import { applyColorTheme, ColorTheme, parseColorTheme } from "./misc/colorTheme";

export interface AppHeaderProps {
  connectedDeviceLabel?: string;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  onResetSettings?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const AppHeader = ({
  connectedDeviceLabel,
  canRedo,
  canUndo,
  onRedo,
  onUndo,
  onSave,
  onDiscard,
  onDisconnect,
  onResetSettings,
}: AppHeaderProps) => {
  const [showSettingsReset, setShowSettingsReset] = useState(false);
  const [colorScheme, setColorScheme] = useLocalStorageState<ColorSchemePreference>(
    "colorScheme",
    "system",
    { deserialize: parseColorSchemePreference }
  );
  const [colorTheme, setColorTheme] = useLocalStorageState<ColorTheme>(
    "colorTheme",
    "zmk",
    { deserialize: parseColorTheme }
  );

  const lockState = useContext(LockStateContext);
  const connectionState = useContext(ConnectionContext);

  const setTheme = (theme: ColorTheme) => {
    setColorTheme(theme);
    applyColorTheme(theme);
  };

  const setScheme = (scheme: ColorSchemePreference) => {
    setColorScheme(scheme);
    applyColorSchemePreference(scheme);
  };

  useEffect(() => {
    if (
      (!connectionState.conn ||
        lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) &&
      showSettingsReset
    ) {
      setShowSettingsReset(false);
    }
  }, [connectionState.conn, lockState, showSettingsReset]);

  useEffect(() => {
    applyColorSchemePreference(colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  const showSettingsRef = useModalRef(showSettingsReset);
  const [unsaved, setUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges
  );

  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", (unsaved) =>
    setUnsaved(unsaved)
  );

  return (
    <header className="top-0 left-0 right-0 grid grid-cols-[1fr_auto_1fr] items-center justify-between h-10 max-w-full">
      <div className="flex px-3 items-center gap-1">
        <img src="/zmk.svg" alt="ZMK Logo" className="h-8 rounded" />
        <p>Studio</p>
      </div>
      <GenericModal ref={showSettingsRef} className="max-w-[50vw]">
        <h2 className="my-2 text-lg">Restore Stock Settings</h2>
        <div>
          <p>
            Settings reset will remove any customizations previously made in ZMK
            Studio and restore the stock keymap
          </p>
          <p>Continue?</p>
          <div className="flex justify-end my-2 gap-3">
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => setShowSettingsReset(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => {
                setShowSettingsReset(false);
                onResetSettings?.();
              }}
            >
              Restore Stock Settings
            </Button>
          </div>
        </div>
      </GenericModal>
      <MenuTrigger>
        <Button
          className="text-center rac-disabled:opacity-0 hover:bg-base-300 transition-all duration-100 p-1 pl-2 rounded-lg"
          isDisabled={!connectedDeviceLabel}
        >
          {connectedDeviceLabel}
          <ChevronDown className="inline-block w-4" />
        </Button>
        <Popover>
          <Menu className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden">
            <MenuItem
              className="px-2 py-1 hover:bg-base-200"
              onAction={onDisconnect}
            >
              Disconnect
            </MenuItem>
            <MenuItem
              className="px-2 py-1 hover:bg-base-200"
              onAction={() => setShowSettingsReset(true)}
            >
              Restore Stock Settings
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <div className="flex justify-end gap-1 px-2">
        <MenuTrigger>
          <Tooltip label="Palette">
            <Button className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300">
              <Palette className="inline-block w-4 mx-1" aria-label="Palette" />
            </Button>
          </Tooltip>
          <Popover>
            <Menu
              className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden"
              onAction={(key) => setTheme(parseColorTheme(String(key)))}
            >
              <MenuItem
                key="zmk"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("zmk")}
              >
                Default
              </MenuItem>
              <MenuItem
                key="ocean"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("ocean")}
              >
                Ocean
              </MenuItem>
              <MenuItem
                key="forest"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("forest")}
              >
                Forest
              </MenuItem>
              <MenuItem
                key="sakura"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("sakura")}
              >
                Sakura
              </MenuItem>
              <MenuItem
                key="sunset"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("sunset")}
              >
                Sunset
              </MenuItem>
              <MenuItem
                key="mono"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setTheme("mono")}
              >
                Mono
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>

        <MenuTrigger>
          <Tooltip label="Color scheme">
            <Button className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300">
              {colorScheme === "light" ? (
                <Sun className="inline-block w-4 mx-1" aria-label="Theme: light" />
              ) : colorScheme === "dark" ? (
                <Moon className="inline-block w-4 mx-1" aria-label="Theme: dark" />
              ) : (
                <Monitor
                  className="inline-block w-4 mx-1"
                  aria-label="Theme: system"
                />
              )}
            </Button>
          </Tooltip>
          <Popover>
            <Menu
              className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden"
              onAction={(key) =>
                setScheme(parseColorSchemePreference(String(key)))
              }
            >
              <MenuItem
                key="system"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setScheme("system")}
              >
                System
              </MenuItem>
              <MenuItem
                key="light"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setScheme("light")}
              >
                Light
              </MenuItem>
              <MenuItem
                key="dark"
                className="px-2 py-1 hover:bg-base-200"
                onAction={() => setScheme("dark")}
              >
                Dark
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>

        {onUndo && (
          <Tooltip label="Undo">
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
              isDisabled={!canUndo}
              onPress={onUndo}
            >
              <Undo2 className="inline-block w-4 mx-1" aria-label="Undo" />
            </Button>
          </Tooltip>
        )}

        {onRedo && (
          <Tooltip label="Redo">
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
              isDisabled={!canRedo}
              onPress={onRedo}
            >
              <Redo2 className="inline-block w-4 mx-1" aria-label="Redo" />
            </Button>
          </Tooltip>
        )}
        <Tooltip label="Save">
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
            isDisabled={!unsaved}
            onPress={onSave}
          >
            <Save className="inline-block w-4 mx-1" aria-label="Save" />
          </Button>
        </Tooltip>
        <Tooltip label="Discard">
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50"
            onPress={onDiscard}
            isDisabled={!unsaved}
          >
            <Trash2 className="inline-block w-4 mx-1" aria-label="Discard" />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
};
