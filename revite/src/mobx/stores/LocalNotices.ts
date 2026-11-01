import { makeAutoObservable, observable } from "mobx";
import { ulid } from "ulid";

export interface BlockedMessageNotice {
    id: string;
    channelId: string;
    createdAt: number;
}

/**
 * Ephemeral, client-only channel notices.
 *
 * These never touch the API or the message store. They are used for things
 * like the "message could not be delivered" notice shown to a blocked user.
 */
export default class LocalNotices {
    notices = observable.map<string, BlockedMessageNotice[]>();

    constructor() {
        makeAutoObservable(this);
    }

    addBlockedMessage(channelId: string) {
        const current = this.notices.get(channelId) ?? [];
        this.notices.set(channelId, [
            ...current,
            {
                id: ulid(),
                channelId,
                createdAt: Date.now(),
            },
        ]);
    }

    dismiss(channelId: string, id: string) {
        const current = this.notices.get(channelId);
        if (!current) return;

        const next = current.filter((notice) => notice.id !== id);
        if (next.length > 0) {
            this.notices.set(channelId, next);
        } else {
            this.notices.delete(channelId);
        }
    }

    get(channelId: string) {
        return this.notices.get(channelId) ?? [];
    }
}

export const localNotices = new LocalNotices();
