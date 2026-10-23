import { Shield } from "@styled-icons/boxicons-regular";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";

import { getNitroTier, isDeveloper, isOwner } from "../../../lib/owner";
import { CLL_SERVER_ID } from "../../../lib/constants";
import { useClient } from "../../../controllers/client/ClientController";
import earlyMemberIcon from "../../../assets/badges/early_member.svg";
import developerWrenchIcon from "../../../assets/badges/developer_wrench.svg";

import Tooltip from "../Tooltip";
import OwnerBadge from "./OwnerBadge";

enum Badges {
    Developer = 1,
    Translator = 2,
    Supporter = 4,
    ResponsibleDisclosure = 8,
    Founder = 16,
    PlatformModeration = 32,
    ActiveSupporter = 64,
    Paw = 128,
    EarlyAdopter = 256,
    ReservedRelevantJokeBadge1 = 512,
    ReservedRelevantJokeBadge2 = 1024,
    BugHunter = 4096,
}

const BadgesBase = styled.div`
    gap: 8px;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;

    img,
    svg {
        width: 24px;
        height: 24px;
    }

    .more {
        font-size: 11px;
        font-weight: 700;
        color: var(--secondary-foreground);
        background: var(--tertiary-background);
        border-radius: 999px;
        padding: 3px 7px;
    }
`;

interface Props {
    badges: number;
    uid?: string;
    privileged?: boolean;
    max?: number;
}

type Item = { key: string; title: string; node: Children };

export default function UserBadges({
    badges,
    uid,
    privileged = false,
    max = 6,
}: Props) {
    const client = useClient();
    const ownerAccount = isOwner(uid);
    const items: Item[] = [];
    const earlyMember = (() => {
        if (!uid) return false;
        const server = client.servers.get(CLL_SERVER_ID);
        if (!server) return false;
        return !!client.members.getKey({
            server: CLL_SERVER_ID,
            user: uid,
        });
    })();

    if (earlyMember || isOwner(uid)) {
        items.push({
            key: "early_member",
            title: "Early Member (under 1k)",
            node: (
                <Tooltip content="Early Member · before 1,000 members">
                    <img
                        src={earlyMemberIcon}
                        alt="Early Member"
                    />
                </Tooltip>
            ),
        });
    }

    if (isOwner(uid)) {
        items.push({
            key: "owner",
            title: "NullCord Owner",
            node: <OwnerBadge size={24} />,
        });
    }

    const nitroTier = getNitroTier({ _id: uid, privileged });
    if (nitroTier) {
        const label = nitroTier === "basic" ? "Nitro Basic" : "Nitro";
        items.push({
            key: "nitro",
            title: label,
            node: (
                <Tooltip content={label}>
                    <img
                        src="/assets/badges/nitro-gift.svg"
                        alt={label}
                    />
                </Tooltip>
            ),
        });
    }

    if (privileged) {
        items.push({
            key: "admin",
            title: "Administrator",
            node: (
                <Tooltip content="Administrator">
                    <img src="/assets/badges/admin.svg" alt="Administrator" />
                </Tooltip>
            ),
        });
    }

    if (ownerAccount || badges & Badges.BugHunter) {
        items.push({
            key: "bughunter",
            title: "Bug Hunter",
            node: (
                <Tooltip content="Bug Hunter">
                    <img src="/assets/badges/bughunter.svg" alt="Bug Hunter" />
                </Tooltip>
            ),
        });
    }

    if (ownerAccount || badges & Badges.Founder) {
        items.push({
            key: "founder",
            title: "Founder",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.founder" />
                    }>
                    <img src="/assets/badges/founder.svg" alt="Founder" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || isDeveloper({ _id: uid, badges, privileged })) {
        items.push({
            key: "developer",
            title: "NullCord Developer",
            node: (
                <Tooltip content="NullCord Developer">
                    <img
                        src={developerWrenchIcon}
                        alt="NullCord Developer"
                    />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.Translator) {
        items.push({
            key: "translator",
            title: "Translator",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.translator" />
                    }>
                    <img src="/assets/badges/translator.svg" alt="Translator" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.EarlyAdopter) {
        items.push({
            key: "early",
            title: "Early Adopter",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.early_adopter" />
                    }>
                    <img
                        src="/assets/badges/early_adopter.svg"
                        alt="Early Adopter"
                    />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.PlatformModeration) {
        items.push({
            key: "moderation",
            title: "Platform Moderation",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.moderation" />
                    }>
                    <img
                        src="/assets/badges/moderation.svg"
                        alt="Platform Moderation"
                    />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.ResponsibleDisclosure) {
        items.push({
            key: "disclosure",
            title: "Responsible Disclosure",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.responsible_disclosure" />
                    }>
                    <Shield size={24} color="gray" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.Supporter) {
        items.push({
            key: "supporter",
            title: "Supporter",
            node: (
                <Tooltip
                    content={
                        <Text id="app.special.popovers.user_profile.badges.supporter" />
                    }>
                    <img src="/assets/badges/supporter.svg" alt="Supporter" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.ActiveSupporter) {
        items.push({
            key: "active_supporter",
            title: "Active Supporter",
            node: (
                <Tooltip content="Active Supporter">
                    <img
                        src="/assets/badges/active_supporter.svg"
                        alt="Active Supporter"
                    />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.Paw) {
        items.push({
            key: "paw",
            title: "Paw",
            node: (
                <Tooltip content="🦊">
                    <img src="/assets/badges/paw.svg" alt="Paw" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.ReservedRelevantJokeBadge1) {
        items.push({
            key: "amog",
            title: "sus",
            node: (
                <Tooltip content="sus">
                    <img src="/assets/badges/amog.svg" alt="sus" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || badges & Badges.ReservedRelevantJokeBadge2) {
        items.push({
            key: "amorbus",
            title: "It's Morbin Time",
            node: (
                <Tooltip content="It's Morbin Time">
                    <img src="/assets/badges/amorbus.svg" alt="Morbin" />
                </Tooltip>
            ),
        });
    }
    if (ownerAccount || uid === "01EX2NCWQ0CHS3QJF0FEQS1GR4") {
        items.push({
            key: "raccoon",
            title: "🦝",
            node: (
                <Tooltip content="🦝">
                    <img src="/assets/badges/raccoon.svg" alt="Raccoon" />
                </Tooltip>
            ),
        });
    }

    if (!items.length) return <></>;

    const limit = ownerAccount ? 0 : max;
    const visible = limit > 0 ? items.slice(0, limit) : items;
    const hidden = limit > 0 ? items.slice(limit) : [];

    return (
        <BadgesBase>
            {visible.map((item) => (
                <span key={item.key}>{item.node}</span>
            ))}
            {hidden.length > 0 && (
                <Tooltip
                    content={hidden.map((item) => item.title).join(" · ")}>
                    <span className="more">+{hidden.length}</span>
                </Tooltip>
            )}
        </BadgesBase>
    );
}
