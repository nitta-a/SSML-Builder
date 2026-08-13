import type { ReactElement } from "react";
import { InsertionPopovers, type InsertionPopoversProps } from "./InsertionPopovers";

export type TimingPopoversProps = InsertionPopoversProps;

export function TimingPopovers(props: TimingPopoversProps): ReactElement {
  return <InsertionPopovers {...props} />;
}
