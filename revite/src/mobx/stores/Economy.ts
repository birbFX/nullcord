import { action, makeAutoObservable, runInAction } from "mobx";
import { Client } from "revolt.js";

export type NitroTier = "basic" | "nitro" | null;

export interface ServerQuest {
    id: string;
    verification: string;
    target: number;
    reward: number;
    progress: number;
    verified: boolean;
    claimed: boolean;
}

export interface EconomyData {
    orbs: number;
    nitro: NitroTier;
    date: string;
    admin: boolean;
    quests: ServerQuest[];
}

/**
 * Server-authoritative Orbs, Nitro and daily quest state.
 *
 * Nothing in this store is read from or written to localStorage. The API
 * decides the balance, tier and whether a quest can be claimed.
 */
export default class Economy {
    userId?: string;
    orbs = 0;
    nitro: NitroTier = null;
    date = "";
    admin = false;
    quests: ServerQuest[] = [];
    loaded = false;
    loading = false;
    error?: string;

    constructor() {
        makeAutoObservable(this);
    }

    @action apply(data: EconomyData) {
        this.orbs = Math.max(0, data.orbs || 0);
        this.nitro = data.nitro ?? null;
        this.date = data.date;
        this.admin = !!data.admin;
        this.quests = data.quests ?? [];
        this.loaded = true;
        this.error = undefined;
    }

    @action reset() {
        this.userId = undefined;
        this.orbs = 0;
        this.nitro = null;
        this.date = "";
        this.admin = false;
        this.quests = [];
        this.loaded = false;
        this.loading = false;
        this.error = undefined;
    }

    async fetch(client: Client) {
        if (this.loading) return;
        this.loading = true;
        try {
            const data = (await client.api.get(
                "/users/@me/economy",
            )) as unknown as EconomyData;
            runInAction(() => {
                this.userId = client.user?._id;
                this.apply(data);
            });
        } catch (err) {
            runInAction(() => {
                this.error =
                    err instanceof Error ? err.message : "Could not load economy.";
            });
        } finally {
            runInAction(() => {
                this.loading = false;
            });
        }
    }

    async claim(client: Client, questId: string) {
        const data = (await client.api.post(
            `/users/@me/economy/quests/${encodeURIComponent(questId)}/claim`,
        )) as unknown as EconomyData;
        runInAction(() => this.apply(data));
        return data;
    }

    async redeem(client: Client, plan: "basic" | "nitro") {
        const data = (await client.api.post(
            "/users/@me/economy/nitro/redeem",
            { plan },
        )) as unknown as EconomyData;
        runInAction(() => this.apply(data));
        return data;
    }

    quest(id: string) {
        return this.quests.find((quest) => quest.id === id);
    }
}

export const economy = new Economy();
