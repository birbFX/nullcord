import "katex/dist/katex.min.css";
import rehypePrism from "rehype-prism";
import rehypeReact from "rehype-react";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import styled, { css } from "styled-components";
import { unified } from "unified";

import { createElement } from "preact";
import { memo } from "preact/compat";
import { useLayoutEffect, useMemo, useState } from "preact/hooks";

// @ts-expect-error no typings
import rehypeKatex from "@revoltchat/rehype-katex";

import { MarkdownProps } from "./Markdown";
import { handlers } from "./hast";
import { RenderCodeblock } from "./plugins/Codeblock";
import { RenderAnchor } from "./plugins/anchors";
import { remarkChannels, RenderChannel } from "./plugins/channels";
import { isOnlyEmoji, remarkEmoji, RenderEmoji } from "./plugins/emoji";
import { remarkHtmlToText } from "./plugins/htmlToText";
import {
    remarkMention,
    remarkMassMention,
    RenderMention,
    RenderMassMention,
} from "./plugins/mentions";
import {
    remarkSpoiler,
    remarkSpoilerPipes,
    RenderSpoiler,
} from "./plugins/spoiler";
import { remarkTimestamps } from "./plugins/timestamps";
import "./prism";

/**
 * Null element
 */
const Null: React.FC = () => null;

/**
 * Custom Markdown components
 */
const components = {
    emoji: RenderEmoji,
    mention: RenderMention,
    massmention: RenderMassMention,
    spoiler: RenderSpoiler,
    channel: RenderChannel,
    a: RenderAnchor,
    p: styled.p`
        margin: 0;

        > code {
            padding: 0 0.2em;
            flex-shrink: 0;
        }
    `,
    h1: styled.h1`
        margin: 8px 0 4px;
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1.375em;
    `,
    h2: styled.h2`
        margin: 8px 0 4px;
        font-size: 1.25rem;
        font-weight: 700;
        line-height: 1.375em;
    `,
    h3: styled.h3`
        margin: 8px 0 4px;
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.375em;
    `,
    h4: styled.h4`
        margin: 4px 0;
    `,
    h5: styled.h5`
        margin: 4px 0;
    `,
    h6: styled.h6`
        margin: 4px 0;
        font-size: 0.8125rem;
        color: var(--tertiary-foreground);
    `,
    pre: RenderCodeblock,
    code: styled.code`
        color: var(--foreground);
        background: var(--block);
        border: 1px solid var(--background);

        font-size: 85%;
        line-height: 1.125rem;
        font-family: var(--monospace-font), monospace;

        border-radius: 4px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
    `,
    table: styled.table`
        border-collapse: collapse;

        th,
        td {
            padding: 6px 10px;
            border: 1px solid var(--tertiary-background);
        }
    `,
    ul: styled.ul`
        list-style-position: outside;
        padding-inline-start: 1.25em;
        margin: 4px 0 0 0.5em;
    `,
    ol: styled.ol`
        list-style-position: outside;
        padding-inline-start: 1.25em;
        margin: 4px 0 0 0.5em;
    `,
    li: styled.li`
        margin-bottom: 4px;

        ${(props) =>
            props.class === "task-list-item" &&
            css`
                list-style-type: none;
            `}
    `,
    blockquote: styled.blockquote`
        margin: 0;
        padding: 0 8px 0 12px;
        position: relative;

        &::before {
            content: "";
            position: absolute;
            inset-inline-start: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            border-radius: 4px;
            background: var(--tertiary-background);
        }

        > * {
            margin: 0;
        }
    `,
    // Block image elements
    img: Null,
    // Catch literally everything else just in case
    video: Null,
    figure: Null,
    picture: Null,
    source: Null,
    audio: Null,
    script: Null,
    style: Null,
};

/**
 * Unified Markdown renderer
 */
const render = unified()
    .use(remarkParse)
    .use(remarkBreaks)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkSpoiler)
    .use(remarkSpoilerPipes)
    .use(remarkChannels)
    .use(remarkTimestamps)
    .use(remarkEmoji)
    .use(remarkMention)
    .use(remarkMassMention)
    .use(remarkHtmlToText)
    .use(remarkRehype, {
        handlers,
    })
    .use(rehypeKatex, {
        maxSize: 10,
        maxExpand: 0,
        maxLength: 512,
        trust: false,
        strict: false,
        output: "html",
        throwOnError: false,
        errorColor: "var(--error)",
    })
    .use(rehypePrism)
    // @ts-expect-error typings do not
    // match between Preact and React
    .use(rehypeReact, {
        createElement,
        Fragment,
        components,
    });

/**
 * Markdown parent container
 */
const Container = styled.div.attrs({ "data-component": "markdown" })<{
    largeEmoji: boolean;
}>`
    line-height: 1.375rem;
    overflow-wrap: break-word;
    color: var(--foreground);

    // Allow scrolling block math
    .math-display {
        overflow-x: auto;
    }

    // Set emoji size
    --emoji-size: ${(props) => (props.largeEmoji ? "3rem" : "1.375em")};

    // Underline link hover
    a:hover {
        text-decoration: underline;
    }
`;

/**
 * Regex for matching execessive recursion of blockquotes and lists
 */
const RE_RECURSIVE =
    /(^(?:(?:[>*+-]|\d+\.)[^\S\r\n]*){5})(?:(?:[>*+-]|\d+\.)[^\S\r\n]*)+(.*$)/gm;

/**
 * Regex for matching multi-line blockquotes
 */
const RE_BLOCKQUOTE = /^([^\S\r\n]*>[^\n]+\n?)+/gm;

/**
 * Regex for matching HTML tags
 */
const RE_HTML_TAGS = /^(<\/?[a-zA-Z0-9]+>)(.*$)/gm;

/**
 * Regex for matching empty lines
 */
const RE_EMPTY_LINE = /^\s*?$/gm;

/**
 * Regex for matching line starting with plus
 */
const RE_PLUS = /^\s*\+(?:$|[^+])/gm;

/**
 * Sanitise Markdown input before rendering
 * @param content Input string
 * @returns Sanitised string
 */
function sanitise(content: string) {
    return (
        content
            // Strip excessive blockquote or list indentation
            .replace(RE_RECURSIVE, (_, m0, m1) => m0 + m1)

            // Append empty character if string starts with html tag
            // This is to avoid inconsistencies in rendering Markdown inside/after HTML tags
            // https://github.com/revoltchat/revite/issues/733
            .replace(RE_HTML_TAGS, (match) => `\u200E${match}`)

            // Append empty character if line starts with a plus
            // which would usually open a new list but we want
            // to avoid that behaviour in our case.
            .replace(RE_PLUS, (match) => `\u200E${match}`)

            // Replace empty lines with non-breaking space
            // because remark renderer is collapsing empty
            // or otherwise whitespace-only lines of text
            .replace(RE_EMPTY_LINE, "‎")

            // Ensure empty line after blockquotes for correct rendering
            .replace(RE_BLOCKQUOTE, (match) => `${match}\n`)
    );
}

/**
 * Remark renderer component
 */
export default memo(({ content, disallowBigEmoji }: MarkdownProps) => {
    const sanitisedContent = useMemo(() => sanitise(content), [content]);

    const [Content, setContent] = useState<React.ReactElement>(null!);

    useLayoutEffect(() => {
        try {
            render
                .process(sanitisedContent)
                .then((file) => setContent(file.result));
        } catch (err) {
            setContent("Message failed to render." as never);
        }
    }, [sanitisedContent]);

    const largeEmoji = useMemo(
        () => !disallowBigEmoji && isOnlyEmoji(content!),
        [content, disallowBigEmoji],
    );

    return <Container largeEmoji={largeEmoji}>{Content}</Container>;
});
