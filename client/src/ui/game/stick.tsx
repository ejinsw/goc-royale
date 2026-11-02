import type { ReactNode } from "react";
import { controlAttrs, type ControlBase, type InputRendererProps } from "../core/control";
import { Icon } from "../core/icons";

/**
 * The `stick` input type (docs/CODE-PRACTICES.md §6.1). It renders structure
 * only; the touch router in touchRouter.ts owns every pointer, position, and
 * thumb transform so no stick movement reaches React.
 */
export interface StickProps extends ControlBase {
  role: "move" | "attack" | "super";
  children?: ReactNode;
}

export function StickInput({ spec, props }: InputRendererProps<StickProps>) {
  return (
    <div
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
      data-stick={props.role}
      role="group"
      aria-label={props.label}
    >
      <div className="ui-stick-base">
        {props.children}
        <div className="ui-stick-thumb">{props.icon && <Icon name={props.icon} />}</div>
      </div>
      {!props.hideLabel && <span className="ui-stick-label">{props.label}</span>}
    </div>
  );
}
