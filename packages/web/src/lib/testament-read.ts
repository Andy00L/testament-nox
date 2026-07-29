"use client";

import {
  TESTAMENT_STATE,
  testamentRegistryAbi,
  type TestamentState,
  type TestamentSummary,
} from "@testament/shared";
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { readDeployment } from "@/lib/chain";

/**
 * Reading a testament. Everything the interface knows about a will comes through here, so
 * there is one place that decodes the registry's tuples into named fields.
 */

type TestamentRecord = readonly [Address, Address, number, number, bigint, number];

export type ActiveTestament = (
  | { status: "not-deployed"; missing: string[] }
  | { status: "disconnected" }
  | { status: "loading" }
  | { status: "none" }
  | { status: "found"; testamentId: bigint; summary: TestamentSummary }
) & {
  /** Re-reads both queries. Called after a write lands so the UI never shows stale state. */
  refetch: () => void;
};

/** The connected wallet's current unreleased testament, if it has one. */
export function useActiveTestament(): ActiveTestament {
  const deployment = readDeployment();
  const { address, isConnected } = useAccount();
  const registryAddress = deployment.isDeployed ? deployment.addresses.registry : undefined;

  const activeIdQuery = useReadContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "activeTestamentOf",
    args: address === undefined ? undefined : [address],
    query: { enabled: registryAddress !== undefined && address !== undefined },
  });

  const activeId = activeIdQuery.data;
  const hasTestament = typeof activeId === "bigint" && activeId !== 0n;

  const recordQuery = useReadContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "testamentOf",
    args: hasTestament ? [activeId] : undefined,
    query: { enabled: registryAddress !== undefined && hasTestament },
  });

  const refetch = () => {
    void activeIdQuery.refetch();
    void recordQuery.refetch();
  };

  if (!deployment.isDeployed) {
    return { status: "not-deployed", missing: deployment.missing, refetch };
  }
  if (!isConnected || address === undefined) {
    return { status: "disconnected", refetch };
  }
  if (activeIdQuery.isPending) {
    return { status: "loading", refetch };
  }
  if (!hasTestament) {
    return { status: "none", refetch };
  }
  if (recordQuery.isPending || recordQuery.data === undefined) {
    return { status: "loading", refetch };
  }

  return {
    status: "found",
    testamentId: activeId,
    summary: toTestamentSummary(recordQuery.data as TestamentRecord),
    refetch,
  };
}

/** Any testament by id, for the door page where the visitor is not the owner. */
export function useTestamentById(testamentId: bigint | undefined) {
  const deployment = readDeployment();
  const registryAddress = deployment.isDeployed ? deployment.addresses.registry : undefined;

  const recordQuery = useReadContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "testamentOf",
    args: testamentId === undefined ? undefined : [testamentId],
    query: { enabled: registryAddress !== undefined && testamentId !== undefined },
  });

  const slotsQuery = useReadContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "slotsOf",
    args: testamentId === undefined ? undefined : [testamentId],
    query: { enabled: registryAddress !== undefined && testamentId !== undefined },
  });

  return {
    isPending: recordQuery.isPending || slotsQuery.isPending,
    summary:
      recordQuery.data === undefined
        ? undefined
        : toTestamentSummary(recordQuery.data as TestamentRecord),
    slotHandles: slotsQuery.data as readonly Hex[] | undefined,
    refetch: () => {
      void recordQuery.refetch();
      void slotsQuery.refetch();
    },
  };
}

/** The id of the most recently written testament, so the door can find something to show. */
export function useLastTestamentId(): bigint | undefined {
  const deployment = readDeployment();
  const registryAddress = deployment.isDeployed ? deployment.addresses.registry : undefined;

  const query = useReadContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "lastTestamentId",
    query: { enabled: registryAddress !== undefined },
  });

  return typeof query.data === "bigint" ? query.data : undefined;
}

function toTestamentSummary(record: TestamentRecord): TestamentSummary {
  const [owner, safe, interval, grace, lastHeartbeat, state] = record;
  return {
    owner,
    safe,
    interval,
    grace,
    lastHeartbeat: Number(lastHeartbeat),
    state: state as TestamentState,
  };
}

/**
 * A ticking clock in seconds, or null until the component has mounted.
 *
 * External system: the browser's wall clock. It stays null on the server so the markup the
 * server sends and the markup the client hydrates always agree.
 */
export function useNowSeconds(tickMs = 1000): number | null {
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);

  useEffect(() => {
    const readNow = () => setNowSeconds(Math.floor(Date.now() / 1000));
    readNow();
    const timer = window.setInterval(readNow, tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);

  return nowSeconds;
}

export const TESTAMENT_STATE_VALUES = TESTAMENT_STATE;
