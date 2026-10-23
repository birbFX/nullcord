import { Shield } from "@styled-icons/boxicons-regular";
import styled from "styled-components/macro";

import { Text } from "preact-i18n";

import { isNitro, isOwner } from "../../../lib/owner";

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
    const items: Item[] = [];

    if (isOwner(uid)) {
        items.push({
            key: "owner",
            title: "NullCord Owner",
            node: <OwnerBadge size={24} />,
        });
    }

    if (isNitro({ _id: uid, privileged })) {
        items.push({
            key: "nitro",
            title: "Nitro",
            node: (
                <Tooltip content="Nitro">
                    <img src="/assets/badges/nitro-gift.svg" alt="Nitro" />
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

    if (isOwner(uid) || badges & Badges.BugHunter) {
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

    if (badges & Badges.Founder) {
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
    if (badges & Badges.Developer) {
        items.push({
            key: "developer",
            title: "Developer",
            node: (
                <Tooltip content={<Text id="app.navigation.tabs.dev" />}>
                    <img src="/assets/badges/developer.svg" alt="Developer" />
                </Tooltip>
            ),
        });
    }
    if (badges & Badges.Translator) {
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
    if (badges & Badges.EarlyAdopter) {
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
    if (badges & Badges.PlatformModeration) {
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
    if (badges & Badges.ResponsibleDisclosure) {
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
    if (badges & Badges.Supporter) {
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
    if (badges & Badges.Paw) {
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
    if (badges & Badges.ReservedRelevantJokeBadge1) {
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
    if (badges & Badges.ReservedRelevantJokeBadge2) {
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
    if (uid === "01EX2NCWQ0CHS3QJF0FEQS1GR4") {
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

    const visible = max > 0 ? items.slice(0, max) : items;
    const hidden = max > 0 ? items.slice(max) : [];

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
