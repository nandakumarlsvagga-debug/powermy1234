/**
 * `@workspace/api-zod` — public surface.
 *
 * Re-exports both the generated TypeScript interfaces (`./generated/types`)
 * and the generated Zod schemas + per-field constants (`./generated/api`).
 *
 * Orval emits a duplicate identifier for any operation whose request or
 * response body is a top-level component schema — once as the TS interface
 * (PascalCase, type-only) under `types/`, and once as the Zod schema
 * constant (PascalCase, value) under `api.ts`. The two are intentionally
 * the same identifier so consumers can write
 *
 *   import { ClaimScanResponse } from '@workspace/api-zod';
 *   const parsed: ClaimScanResponse = ClaimScanResponse.parse(payload);
 *
 * To merge them into a single name we re-export the Zod schema (value) from
 * `./generated/api` as the public symbol, and re-export the matching TS
 * interface (type) from `./generated/types`. The `export type` and `export
 * const` (implicit in `export *`) merge into the same identifier without
 * conflict.
 */

import type {
  ClaimScanResponse as ClaimScanResponseType,
  CreateAnonSessionResponse as CreateAnonSessionResponseType,
  CreateScanResponse as CreateScanResponseType,
  GetProfileScansParams as GetProfileScansParamsType,
  GetScanShareCardParams as GetScanShareCardParamsType,
} from "./generated/types";

export type ClaimScanResponse = ClaimScanResponseType;
export type CreateAnonSessionResponse = CreateAnonSessionResponseType;
export type CreateScanResponse = CreateScanResponseType;
export type GetProfileScansParams = GetProfileScansParamsType;
export type GetScanShareCardParams = GetScanShareCardParamsType;

// Re-export every TS interface EXCEPT the five that collide with a Zod
// schema constant of the same name in `./generated/api`. We re-declare those
// as types above so callers can still write `: ClaimScanResponse`.
export type {
  AnomalyType,
  AnonDailyQuota,
  ApiError,
  ApiErrorDailyLimitReached,
  ApiErrorDailyLimitReachedCode,
  ApiErrorForbidden,
  ApiErrorForbiddenCode,
  ApiErrorImageInvalid,
  ApiErrorImageInvalidCode,
  ApiErrorImageInvalidReason,
  ApiErrorInternal,
  ApiErrorInternalCode,
  ApiErrorInvalidInput,
  ApiErrorInvalidInputCode,
  ApiErrorModerationRejected,
  ApiErrorModerationRejectedCode,
  ApiErrorModerationUnavailable,
  ApiErrorModerationUnavailableCode,
  ApiErrorNotFound,
  ApiErrorNotFoundCode,
  ApiErrorRateLimited,
  ApiErrorRateLimitedCode,
  ApiErrorUnauthenticated,
  ApiErrorUnauthenticatedCode,
  ApiErrorVisionUnavailable,
  ApiErrorVisionUnavailableCode,
  Category,
  CategoryStats,
  CoreStats,
  CreateAnonSessionRequest,
  CreateScanRequest,
  CreateScanRevealHints,
  FeedResponse,
  ForbiddenResponse,
  GetFeedParams,
  GetLeaderboardParams,
  HealthStatus,
  InternalResponse,
  InvalidInputResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardResponseScope,
  LeaderboardScope,
  LeaderboardWindow,
  MeResponse,
  MemberDailyQuota,
  MemberPublic,
  NotFoundResponse,
  ProfileAggregates,
  ProfilePublic,
  ProfileResponse,
  ProfileScansResponse,
  RateLimitedResponse,
  RevealVariant,
  ScanPublic,
  SetUsernameRequest,
  SetUsernameResponse,
  ShareCardRatio,
  ShareCardUrls,
  Tier,
  ToggleLikeResponse,
  UnauthenticatedResponse,
} from "./generated/types";

import {
  ClaimScanResponse as ClaimScanResponseVal,
  CreateAnonSessionResponse as CreateAnonSessionResponseVal,
  CreateScanResponse as CreateScanResponseVal,
  GetProfileScansParams as GetProfileScansParamsVal,
  GetScanShareCardParams as GetScanShareCardParamsVal,
} from "./generated/api.js";

export const ClaimScanResponse = ClaimScanResponseVal;
export const CreateAnonSessionResponse = CreateAnonSessionResponseVal;
export const CreateScanResponse = CreateScanResponseVal;
export const GetProfileScansParams = GetProfileScansParamsVal;
export const GetScanShareCardParams = GetScanShareCardParamsVal;

// Zod schemas + per-field constants.
export * from "./generated/api.js";
