import type { ReactElement } from "react";
import { InsertionPopovers, type InsertionPopoversProps } from "./InsertionPopovers";

export type ProsodyPopoversProps = InsertionPopoversProps;

export function ProsodyPopovers(props: ProsodyPopoversProps): ReactElement {
  return <InsertionPopovers {...props} />;
}
