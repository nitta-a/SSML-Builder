import { Fragment, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { groupExpressAsStylesByCategory, resolveExpressAsStyles } from "../../constants/ssmlPresets";
import { EXPRESS_AS_STYLE_CATEGORY_COPY } from "../../locales";
import { editorStyles as styles } from "../../styles/editorStyles";
import type { InsertionPopoversProps } from "./InsertionPopovers";

export interface ProsodyPopoversProps extends InsertionPopoversProps {
  voiceName?: string;
}

function renderStyleGroups(
  insertion: NonNullable<InsertionPopoversProps["insertions"]>[number],
  language: "ja" | "en",
  onApply: InsertionPopoversProps["onApply"],
  onClose: InsertionPopoversProps["onClose"],
  isReadOnly: boolean,
) {
  const categories = groupExpressAsStylesByCategory(
    insertion.options.map((option) => option.value),
  );
  if (categories.length === 0) {
    return null;
  }

  const categoryLabels = EXPRESS_AS_STYLE_CATEGORY_COPY[language];
  const labelByCategory = {
    emotions: categoryLabels.categoryEmotions,
    scenarios: categoryLabels.categoryScenarios,
    media: categoryLabels.categoryMedia,
    other: categoryLabels.categoryOther,
  } as const;
  const defaultValue = categories[0]?.values[0] ?? insertion.options[0]?.value ?? "";

  return (
    <div style={{ padding: "0.5rem", borderBottom: "1px solid rgba(127,127,127,0.25)" }}>
      <label style={{ display: "block", fontSize: "0.75rem", color: "inherit" }}>
        <span style={{ display: "block", marginBottom: "0.25rem" }}>{language === "ja" ? "スタイル" : "Style"}</span>
        <select
          aria-label={insertion.labels[language]}
          defaultValue={defaultValue}
          disabled={isReadOnly}
          onChange={(event) => {
            const nextOption = insertion.options.find((option) => option.value === event.target.value);
            if (nextOption) {
              onApply(insertion, nextOption);
            }
            onClose();
          }}
          style={{ width: "100%", boxSizing: "border-box" }}
        >
          {categories.map(({ category, values }) => (
            <optgroup key={category} label={labelByCategory[category]}>
              {values.map((value) => {
                const option = insertion.options.find((candidate) => candidate.value === value);
                if (!option) {
                  return null;
                }
                return (
                  <option key={value} value={value}>
                    {option.labels[language]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ProsodyPopovers({ insertions, voiceName, ...props }: ProsodyPopoversProps): ReactElement {
  const filteredInsertions = insertions.map((insertion) => {
    if (insertion.id !== "emotion" || insertion.tagName?.toLowerCase() !== "mstts:express-as") {
      return insertion;
    }

    const styles = new Set(
      resolveExpressAsStyles(
        voiceName,
        insertion.options.map((option) => option.value),
      ),
    );
    const options = insertion.options.filter((option) => styles.has(option.value));
    return {
      ...insertion,
      options,
    };
  });

  return (
    <>
      {filteredInsertions.map((insertion) => {
        const isOpen = props.openPopoverId === insertion.id;
        const menu =
          isOpen && props.menuPosition && typeof document !== "undefined" ? (
            <div
              ref={props.menuRef}
              id={`ssml-editor-popover-${insertion.id}`}
              data-ssml-editor=""
              data-theme={props.isDarkTheme ? "dark" : "light"}
              style={{ ...styles.toolbarMenu, top: props.menuPosition.top, left: props.menuPosition.left }}
              role="menu"
              aria-label={insertion.labels[props.language]}
            >
              {insertion.options.length === 0 ? (
                <p role="status" style={styles.toolbarEmpty}>
                  {props.emptyOptionsMessage}
                </p>
              ) : (
                <>
                  {renderStyleGroups(
                    insertion,
                    props.language,
                    props.onApply,
                    props.onClose,
                    props.isReadOnly,
                  )}
                  {insertion.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitem"
                      style={styles.toolbarOption}
                      title={option.descriptions?.[props.language] ?? insertion.descriptions[props.language]}
                      disabled={props.isReadOnly}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!props.isReadOnly) {
                          props.onApply(insertion, option);
                        }
                        props.onClose();
                      }}
                    >
                      {option.labels[props.language]}
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : null;

        return (
          <Fragment key={insertion.id}>
            <div style={styles.toolbarDropdown}>
              <button
                type="button"
                style={props.toolbarButtonStyle}
                title={
                  insertion.titles?.[props.language] ??
                  `${insertion.labels[props.language]} — ${insertion.descriptions[props.language]}`
                }
                aria-label={insertion.labels[props.language]}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `ssml-editor-popover-${insertion.id}` : undefined}
                onClick={(event) => props.onToggle(insertion.id, event.currentTarget)}
              >
                {props.showToolbarIcons && (
                  <span style={styles.toolbarIcon} aria-hidden="true">
                    {insertion.icon}
                  </span>
                )}
                {props.showToolbarText && <span>{insertion.labels[props.language]}</span>}
                <span style={styles.toolbarChevron} aria-hidden="true">
                  ▾
                </span>
              </button>
            </div>
            {menu && createPortal(menu, document.body)}
          </Fragment>
        );
      })}
    </>
  );
}
