"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { api } from "@/lib/client/api";
import { HANDLE_RE } from "@/lib/site";
import type { Profile } from "@/lib/model";

const CATEGORIES = ["Art", "ASMR", "Cosplay", "Fashion", "Fitness", "Food", "Gaming", "Music", "Photography", "Travel", "Lifestyle", "Other"];

/**
 * Handle, name, bio, category, avatar and cover. With `becomeCreator`, saving
 * also flips the creator flag (the server insists on a handle and a name).
 */
export function ProfileForm({ becomeCreator = false, onSaved }: { becomeCreator?: boolean; onSaved?: (p: Profile) => void }) {
  const { profile, setProfile } = useSession();
  const qc = useQueryClient();
  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [category, setCategory] = useState(profile?.category ?? "");
  const [avatar, setAvatar] = useState<{ id: string; url: string } | null>(null);
  const [cover, setCover] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;

  const upload = async (file: File | undefined, which: "avatar" | "cover") => {
    if (!file) return;
    setBusy(which);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ media: { id: string; url: string } }>("/api/upload", { form });
      (which === "avatar" ? setAvatar : setCover)(res.media);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleOk = handle === "" || HANDLE_RE.test(handle.toLowerCase());
  const canSave = !busy && handleOk && (!becomeCreator || (handle && displayName.trim()));

  const save = async () => {
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ profile: Profile }>("/api/me", {
        method: "PATCH",
        body: {
          handle: handle.toLowerCase(),
          displayName,
          bio,
          category,
          ...(avatar ? { avatarMedia: avatar.id } : {}),
          ...(cover ? { coverMedia: cover.id } : {}),
          ...(becomeCreator ? { isCreator: true } : {}),
        },
      });
      setProfile(res.profile);
      setAvatar(null);
      setCover(null);
      setSaved(true);
      await qc.invalidateQueries();
      onSaved?.(res.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const preview = { ...profile, avatar: avatar?.url ?? profile.avatar, displayName, handle: handle || profile.handle };

  return (
    <div className="mt-4 space-y-4">
      <div className="relative overflow-hidden rounded-[10px] border border-line">
        <div className="h-[120px] bg-bg-3">
          {(cover?.url ?? profile.cover) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover?.url ?? profile.cover!} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full brand-gradient" />
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm absolute right-3 top-3" onClick={() => coverRef.current?.click()} disabled={busy !== null}>
          {busy === "cover" ? <Icon name="spinner" size={14} className="spin" /> : <Icon name="image" size={14} />} Cover
        </button>
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "cover")} />
        <div className="flex items-end gap-3 px-4 pb-4">
          <div className="-mt-10">
            <Avatar profile={preview} size={80} ring />
          </div>
          <button type="button" className="btn btn-ghost btn-sm mb-1" onClick={() => avatarRef.current?.click()} disabled={busy !== null}>
            {busy === "avatar" ? <Icon name="spinner" size={14} className="spin" /> : <Icon name="user" size={14} />} Avatar
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "avatar")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Handle</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">@</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))} className={`field pl-8 ${handleOk ? "" : "!border-danger"}`} placeholder="yourname" maxLength={24} autoCapitalize="off" />
          </span>
          <span className="mt-1 block text-[12px] text-ink-3">3–24 letters, numbers, dots, underscores. Your page is onlychain/@handle.</span>
        </label>
        <label className="block">
          <span className="field-label">Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="field" placeholder="How fans see you" maxLength={40} />
        </label>
      </div>
      <label className="block">
        <span className="field-label">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="field" rows={3} placeholder="What you make, how often, what subscribers get." maxLength={600} />
      </label>
      <label className="block sm:w-1/2">
        <span className="field-label">Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field">
          <option value="">—</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-accent" onClick={save} disabled={!canSave}>
          {busy === "save" ? <Icon name="spinner" size={16} className="spin" /> : null} {becomeCreator ? "Open my page" : "Save"}
        </button>
        {saved && <span className="text-[13px] text-success">Saved.</span>}
        {error && <span className="text-[13px] text-danger">{error}</span>}
      </div>
    </div>
  );
}
