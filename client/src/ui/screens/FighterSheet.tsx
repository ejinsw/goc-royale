import { FIGHTERS, IDS, type FighterId } from "../../../../shared/definitions";
import { fighterArt } from "../../art";
import { menuKit } from "../menu/menuKit";

const { Control, Display } = menuKit;

const MAX_HP = Math.max(...IDS.map((id) => FIGHTERS[id].hp));
const MAX_RANGE = Math.max(...IDS.map((id) => FIGHTERS[id].range));

/**
 * Fighter picker: a portrait strip plus one focused fighter card. Picking a
 * tile takes effect immediately and the stage fighter swaps with a hop.
 */
export function FighterSheet({
  value,
  onPick,
  onClose,
}: {
  value: FighterId;
  onPick: (id: FighterId) => void;
  onClose: () => void;
}) {
  const f = FIGHTERS[value];
  return (
    <Display kind="sheet" title="Fighters" icon="users" onClose={onClose}>
      <div className="picker-strip" role="group" aria-label="Choose a fighter">
        {IDS.map((id) => (
          <Control
            key={id}
            kind="tile"
            label={`${FIGHTERS[id].name}, ${FIGHTERS[id].role}`}
            selected={id === value}
            variant={id === value ? "selected" : undefined}
            onPress={() => {
              if (id === value) return;
              onPick(id);
              return "confirm";
            }}
          >
            <Display kind="portrait" src={fighterArt(id)} alt="" />
            <span className="ui-label">{FIGHTERS[id].name}</span>
          </Control>
        ))}
      </div>
      <Display kind="card" className="picker-card" pulseKey={value} emphasis="pop">
        <div className="picker-head">
          <Display kind="label" level="title" text={f.name} />
          <Display kind="badge" variant="primary" text={f.role.toUpperCase()} />
        </div>
        <Display kind="label" level="caption" text={f.team} />
        <div className="picker-stats">
          <Display
            kind="meter"
            mode="bar"
            icon="heart"
            label="Health"
            value={{ fill: f.hp / MAX_HP, text: `${f.hp.toLocaleString()} HP` }}
          />
          <Display
            kind="meter"
            mode="bar"
            icon="aim"
            label="Range"
            value={{ fill: f.range / MAX_RANGE, text: `${f.range} range` }}
          />
          <Display kind="meter" mode="pips" label="Ammo" max={f.ammo} value={{ fill: 1, count: f.ammo }} />
        </div>
        <div className="picker-ability">
          <Display kind="badge" icon="aim" text="ATTACK" />
          <strong>{f.attack}</strong>
          <p>{f.description}</p>
        </div>
        <div className="picker-ability">
          <Display kind="badge" variant="primary" icon="bolt" text="SUPER" />
          <strong>{f.super}</strong>
          <p>{f.superDescription}</p>
        </div>
      </Display>
      <Control kind="button" variant="primary" size="lg" icon="check" label="Done" onPress={onClose} />
    </Display>
  );
}
