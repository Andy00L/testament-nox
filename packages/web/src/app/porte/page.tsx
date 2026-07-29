import Image from "next/image";

import transmissionImage from "@/../public/scene/transmission.webp";

import { DoorBackLink } from "@/components/testament/DoorBackLink";
import { DoorScene } from "@/components/testament/DoorScene";

/**
 * The beneficiary's side of the doorway.
 *
 * `?id=` selects a testament; without it the page shows the most recent one, which is what
 * a demo needs and what a beneficiary following a shared link gets.
 *
 * The transmission illustration stands to the right, behind the curtain layer, so the
 * strands hang between the visitor and the two figures: the elder passing the sword is
 * what this page is waiting to let happen. Hidden on narrow screens, where it would sit
 * behind the text and fight it.
 */
export default async function DoorPage(props: PageProps<"/porte">) {
  const searchParams = await props.searchParams;
  const rawId = searchParams.id;
  const requestedId = parseTestamentId(typeof rawId === "string" ? rawId : undefined);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-40 sm:px-10 sm:pt-48">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-[max(1.5rem,6vw)] hidden lg:block"
        style={{ zIndex: "var(--layer-behind-curtain)" }}
      >
        {/* A soft pool of shade grounds the figures on the mat: one light, from above. */}
        <div
          className="absolute inset-x-[6%] bottom-1 h-10"
          style={{
            background: "radial-gradient(50% 100% at 50% 100%, rgba(58, 45, 42, 0.16), transparent 70%)",
          }}
        />
        <Image
          src={transmissionImage}
          alt=""
          priority={false}
          sizes="(min-width: 1024px) 480px, 0px"
          className="h-auto w-[min(30rem,38vw)] select-none"
        />
      </div>

      <div className="relative max-w-[38rem]" style={{ zIndex: "var(--layer-content)" }}>
        <DoorScene requestedId={requestedId} />
        <DoorBackLink />
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
