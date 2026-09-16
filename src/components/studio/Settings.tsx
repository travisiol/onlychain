"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { ProfileForm } from "@/components/studio/ProfileForm";
import { shortAddress } from "@/lib/format";

/** Profile settings for everyone — fans have a name and an avatar too. */
export function Settings() {
  const { session, profile, signOut } = useSession();
  const router = useRouter();
  if (!session) {
    return (
      <>
        <ColumnHeader title="Settings" />
        <SignInDoor what="your settings" />
      </>
    );
  }
  return (
    <>
      <ColumnHeader title="Settings" sub={shortAddress(session.address, 6)} />
      <div className="p-4">
        <div className="card p-5">
          <h2 className="text-[16px] font-bold">Profile</h2>
          <p className="mt-1 text-[13px] text-ink-2">Shown next to your comments and messages{profile?.isCreator ? ", and on your creator page" : ""}. Your wallet stays the identity; this is just how it looks.</p>
          <ProfileForm />
        </div>
        <div className="card mt-4 p-5">
          <h2 className="text-[16px] font-bold">Session</h2>
          <p className="mt-1 text-[13px] text-ink-2">Signed in as <span className="mono">{session.address}</span>. Signing out clears the cookie; nothing on the chain changes.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
