import { useCallback, useEffect, useRef, useState } from "react";
import { buildSsml } from "@ssml-builder-js/ssml-core";
import type { SsmlDocument } from "@ssml-builder-js/ssml-core";
import { DRAFT_STORAGE_KEY, getErrorMessage, projectFromDraft, readDraftSnapshot } from "../studio";
import type { DraftSnapshot, StudioDraft, StudioProject } from "../studio";

export function useStudioDraft(initialDraft: StudioDraft) {
  const [project, setProject] = useState<StudioProject>(() => projectFromDraft(initialDraft));
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedValue, setSavedValue] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const draftValue = JSON.stringify({ title: project.title, ssml: project.ssml });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw !== null) {
        const snapshot = readDraftSnapshot(raw);
        const restoredProject = projectFromDraft(snapshot);
        setProject(restoredProject);
        setSavedValue(JSON.stringify({ title: snapshot.title, ssml: snapshot.ssml }));
        setSavedAt(snapshot.updatedAt);
        setRestored(true);
      }
    } catch (error) {
      setStorageError(getErrorMessage(error));
    } finally {
      setHydrated(true);
    }
  }, []);

  const saveNow = useCallback((): void => {
    const { title, ssml } = projectRef.current;
    const snapshot: DraftSnapshot = { version: 1, title, ssml, updatedAt: Date.now() };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
      setSavedValue(JSON.stringify({ title, ssml }));
      setSavedAt(snapshot.updatedAt);
      setStorageError(null);
    } catch (error) {
      setStorageError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (!hydrated || storageError || savedValue === draftValue) return;
    const timeout = setTimeout(saveNow, 600);
    return () => clearTimeout(timeout);
  }, [draftValue, hydrated, saveNow, savedValue, storageError]);

  useEffect(() => {
    if (!hydrated || storageError) return;
    const saveOnHide = (): void => {
      if (globalThis.document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("pagehide", saveNow);
    globalThis.document.addEventListener("visibilitychange", saveOnHide);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      globalThis.document.removeEventListener("visibilitychange", saveOnHide);
    };
  }, [hydrated, saveNow, storageError]);

  const updateDocument = useCallback((document: SsmlDocument): void => {
    setProject((current) => ({ ...current, document, ssml: buildSsml(document) }));
  }, []);

  const updateSsml = useCallback((ssml: string): void => {
    setProject((current) => projectFromDraft({ title: current.title, ssml }));
  }, []);

  const updateTitle = useCallback((title: string): void => {
    setProject((current) => ({ ...current, title }));
  }, []);

  const replaceDraft = useCallback((draft: StudioDraft): void => {
    setProject(projectFromDraft(draft));
  }, []);

  return {
    project,
    hydrated,
    savedAt,
    storageError,
    restored,
    isSaving: hydrated && !storageError && draftValue !== savedValue,
    saveNow,
    updateDocument,
    updateSsml,
    updateTitle,
    replaceDraft,
    dismissRestored: () => setRestored(false),
  };
}
