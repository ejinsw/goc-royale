import type { Ref } from "react";
import { FIGHTERS, type FighterId } from "../../../../shared/definitions";
import type { ControlHandle, PressResult } from "../core/control";
import { menuKit } from "../menu/menuKit";

const { Control, Display } = menuKit;

export interface HomeProps {
  name: string;
  onName: (name: string) => void;
  nameHandle: Ref<ControlHandle>;
  code: string;
  onCode: (code: string) => void;
  /** True when the page was opened from an invite link. */
  invited: boolean;
  busy: boolean;
  fighter: FighterId;
  onCreate: () => PressResult;
  onJoin: () => PressResult;
  onFighters: () => PressResult;
  onSettings: () => PressResult;
}

/** Home: fighter on the stage, nickname chip, one dominant play action. */
export function HomeScreen(p: HomeProps) {
  const codeReady = p.code.length === 6;
  const join = (
    <Control
      kind="button"
      variant={p.invited ? "primary" : "dark"}
      size={p.invited ? "hero" : "md"}
      icon="users"
      label={p.invited ? `Join ${p.code}` : "Join"}
      disabled={p.busy ? "Connecting…" : codeReady ? undefined : "Enter the 6-letter room code"}
      onPress={p.onJoin}
    />
  );
  const create = (
    <Control
      kind="button"
      variant={p.invited ? "dark" : "primary"}
      size={p.invited ? "md" : "hero"}
      profile="heavy"
      icon="play"
      label={p.busy ? "Connecting…" : p.invited ? "New room" : "Create room"}
      disabled={p.busy ? "Connecting…" : undefined}
      onPress={p.onCreate}
    />
  );
  return (
    <main className="screen home">
      <header className="bar">
        <Display kind="label" className="brand" level="title" text={<>GOC <b>ROYALE</b></>} />
        <Control
          kind="field"
          className="name-chip"
          icon="edit"
          label="Nickname"
          placeholder="Your nickname"
          value={p.name}
          maxLength={18}
          enterKeyHint="go"
          handle={p.nameHandle}
          validate={(v) => v.trim().length > 0}
          onChange={p.onName}
          onSubmit={() => void (p.invited ? p.onJoin() : p.onCreate())}
        />
        <Control kind="icon" icon="gear" label="Settings" hideLabel onPress={p.onSettings} />
      </header>
      <aside className="rail">
        <Control kind="tile" icon="users" label="Fighters" sub={FIGHTERS[p.fighter].name} onPress={p.onFighters} />
      </aside>
      <section className="dock">
        <div className="join-row">
          <Control
            kind="field"
            label="Room code"
            hideLabel
            icon="link"
            placeholder="ROOM CODE"
            value={p.code}
            maxLength={6}
            transform="upper"
            enterKeyHint="go"
            validate={(v) => /^[A-Z0-9]{6}$/.test(v)}
            onChange={p.onCode}
            onSubmit={() => void p.onJoin()}
          />
          {!p.invited && join}
        </div>
        {p.invited ? (
          <>
            {join}
            {create}
          </>
        ) : (
          create
        )}
      </section>
    </main>
  );
}
