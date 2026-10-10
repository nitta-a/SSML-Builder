import { useState } from "react";
import { mapSsmlTextNodes } from "@ssml-builder-js/ssml-core";
import { getErrorMessage } from "../studio";
import type { StudioCopy } from "../studioCopy";
import type { EditorImplementation } from "./StudioEditor";
import { StudioIcon } from "./StudioIcon";

interface DeveloperToolsProps {
  copy: StudioCopy;
  implementation: EditorImplementation;
  onImplementationChange: (implementation: EditorImplementation) => void;
  ssml: string;
  disabled: boolean;
  onApply: (ssml: string) => void;
}

export function DeveloperTools({
  copy,
  implementation,
  onImplementationChange,
  ssml,
  disabled,
  onApply,
}: DeveloperToolsProps) {
  const [prefix, setPrefix] = useState("Translated: ");
  const [result, setResult] = useState<{ source: string; ssml: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transform = async (): Promise<void> => {
    setMapping(true);
    setError(null);
    try {
      const mapped = await mapSsmlTextNodes(ssml, (text) => (text.trim() ? `${prefix}${text}` : text));
      setResult({ source: ssml, ssml: mapped });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setMapping(false);
    }
  };

  return (
    <details className="studio-panel developer-tools">
      <summary>
        <StudioIcon name="code" />
        <strong>{copy.developer}</strong>
        <span>React / Web Component</span>
      </summary>
      <div className="developer-content">
        <p className="panel-note">{copy.developerHint}</p>
        <fieldset className="engine-options">
          <legend>{copy.engine}</legend>
          {(["react", "web-component"] as const).map((engine) => (
            <label key={engine}>
              <input
                type="radio"
                name="editor-implementation"
                checked={implementation === engine}
                onChange={() => onImplementationChange(engine)}
              />
              {engine === "react" ? "React Component" : "Web Component"}
            </label>
          ))}
        </fieldset>
        <div className="text-transform">
          <h3>{copy.transform}</h3>
          <p className="panel-note">{copy.transformHint}</p>
          <label className="field" htmlFor="text-prefix">
            <span>{copy.prefix}</span>
            <input id="text-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled || mapping || !prefix}
            onClick={() => void transform()}
          >
            {mapping ? copy.transforming : copy.transform}
          </button>
          {error && (
            <p className="inline-error" role="alert">
              {copy.actionError} {error}
            </p>
          )}
          {result && (
            <div className="transform-result">
              <pre>
                <code>{result.ssml}</code>
              </pre>
              <button
                type="button"
                className="button button-secondary"
                disabled={disabled || mapping || result.source !== ssml}
                onClick={() => onApply(result.ssml)}
              >
                {copy.transformApply}
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
