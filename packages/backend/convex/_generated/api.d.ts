/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as expenses_activities from "../expenses/activities.js";
import type * as expenses_dashboard from "../expenses/dashboard.js";
import type * as expenses_items from "../expenses/items.js";
import type * as expenses_trends from "../expenses/trends.js";
import type * as expenses_types from "../expenses/types.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as journal_activeTopics from "../journal/activeTopics.js";
import type * as journal_dashboard from "../journal/dashboard.js";
import type * as journal_entries from "../journal/entries.js";
import type * as journal_model from "../journal/model.js";
import type * as journal_tags from "../journal/tags.js";
import type * as journal_topics from "../journal/topics.js";
import type * as lib_allowlist from "../lib/allowlist.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_users from "../lib/users.js";
import type * as migrations from "../migrations.js";
import type * as ping from "../ping.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  "expenses/activities": typeof expenses_activities;
  "expenses/dashboard": typeof expenses_dashboard;
  "expenses/items": typeof expenses_items;
  "expenses/trends": typeof expenses_trends;
  "expenses/types": typeof expenses_types;
  feedback: typeof feedback;
  http: typeof http;
  "journal/activeTopics": typeof journal_activeTopics;
  "journal/dashboard": typeof journal_dashboard;
  "journal/entries": typeof journal_entries;
  "journal/model": typeof journal_model;
  "journal/tags": typeof journal_tags;
  "journal/topics": typeof journal_topics;
  "lib/allowlist": typeof lib_allowlist;
  "lib/auth": typeof lib_auth;
  "lib/users": typeof lib_users;
  migrations: typeof migrations;
  ping: typeof ping;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
