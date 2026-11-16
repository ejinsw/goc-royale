import { menuKit } from "../menu/menuKit";

const { Control, Display } = menuKit;

export interface SettingsValues {
  sound: number;
  music: number;
  shake: boolean;
  reducedMotion: boolean;
  haptics: boolean;
  shortCutscenes: boolean;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** Settings and pause sheet. The match keeps running while it is open. */
export function SettingsSheet({
  values,
  onChange,
  inMatch,
  host,
  onReconnect,
  onLeave,
  onFullscreen,
  onClose,
}: {
  values: SettingsValues;
  onChange: (next: Partial<SettingsValues>) => void;
  inMatch: boolean;
  host: boolean;
  onReconnect: () => Promise<unknown>;
  onLeave: () => void;
  onFullscreen: () => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Display kind="sheet" title={inMatch ? "Paused" : "Settings"} icon={inMatch ? "pause" : "gear"} onClose={onClose}>
      <div className="settings-group">
        <Control kind="slider" label="Sound" min={0} max={1} step={0.05} value={values.sound} format={percent} onChange={(sound) => onChange({ sound })} />
        <Control kind="slider" label="Music" min={0} max={1} step={0.05} value={values.music} format={percent} onChange={(music) => onChange({ music })} />
        <Control kind="toggle" label="Screen shake" value={values.shake} onChange={(shake) => onChange({ shake })} />
        <Control kind="toggle" label="Reduce motion" value={values.reducedMotion} onChange={(reducedMotion) => onChange({ reducedMotion })} />
        <Control kind="toggle" label="Vibration" value={values.haptics} onChange={(haptics) => onChange({ haptics })} />
        <Control kind="toggle" label="Short cutscenes" value={values.shortCutscenes} onChange={(shortCutscenes) => onChange({ shortCutscenes })} />
        <Control kind="button" variant="dark" icon="expand" label="Toggle full screen" onPress={onFullscreen} />
        <Display kind="label" level="caption" text="Full screen hides browser bars where supported. On iPhone, Add to Home Screen gives the cleanest view." />
      </div>
      <Display
        kind="table"
        className="controls-legend"
        caption="Controls"
        columns={["", "Keyboard + mouse", "Touch"]}
        rows={[
          { key: "move", cells: ["Move", "WASD / arrows", "Left thumb, anywhere"] },
          { key: "aim", cells: ["Attack", "Hold left click, release", "Right thumb: drag to preview, release"] },
          { key: "super", cells: ["Super", "Hold Space / right click", "Drag Super to preview, release"] },
          { key: "ball", cells: ["Ball shot", "Hold click, release", "Drag farther for power"] },
          { key: "item-pickup", cells: ["Pick up / put down", "F", "Pick up / put down button"] },
          { key: "item-use", cells: ["Use item", "E", "Tap item stick to auto-aim, or drag and release"] },
        ]}
      />
      {inMatch && (
        <div className="settings-group">
          <Display kind="label" level="caption" text="The match keeps running while this is open." />
          {!host && (
            <Control kind="button" variant="dark" icon="refresh" label="Reconnect to host" onPress={onReconnect} />
          )}
          <Control
            kind="button"
            variant="danger"
            icon="leave"
            label={host ? "End room and leave" : "Leave match"}
            onPress={() => {
              onLeave();
              onClose();
            }}
          />
        </div>
      )}
      <Control kind="button" variant="primary" size="lg" icon="play" label={inMatch ? "Back to it" : "Done"} onPress={onClose} />
    </Display>
  );
}
