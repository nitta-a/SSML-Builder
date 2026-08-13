import type { ReactElement } from "react";
import { InsertionPopovers, type InsertionPopoversProps } from "./InsertionPopovers";

export type TextPopoversProps = InsertionPopoversProps;

export function TextPopovers(props: TextPopoversProps): ReactElement {
  return <InsertionPopovers {...props} />;
}
