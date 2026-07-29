import Link from "next/link";

import { DoorScene } from "@/components/testament/DoorScene";

/**
 * The beneficiary's side of the doorway.
 *
 * `?id=` selects a testament; without it the page shows the most recent one, which is what
 * a demo needs and what a beneficiary following a shared link gets.
 */
export default async function DoorPage(props: PageProps<"/porte">) {
  const searchParams = await props.searchParams;
  const rawId = searchParams.id;
  const requestedId = parseTestamentId(typeof rawId === "string" ? rawId : undefined);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-40 sm:px-10 sm:pt-48">
      <div className="max-w-[38rem]">
        <DoorScene requestedId={requestedId} />

        <Link
          href="/"
          className="type-small mt-12 inline-block text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          Revenir devant la porte
        </Link>
      </div>
    </div>
  );
}

function parseTestamentId(rawId: string | undefined): bigint | undefined {
  if (rawId === undefined || !/^\d+$/.test(rawId)) {
    return undefined;
  }
  const parsed = BigInt(rawId);
  return parsed > 0n ? parsed : undefined;
}
