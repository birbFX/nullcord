import { API } from "revolt.js";

import styles from "./Attachment.module.scss";
import classNames from "classnames";
import { useTriggerEvents } from "preact-context-menu";
import { useState } from "preact/hooks";

import { useClient } from "../../../../controllers/client/ClientController";
import AttachmentActions from "./AttachmentActions";
import { SizedGrid } from "./Grid";
import ImageFile from "./ImageFile";
import Spoiler from "./Spoiler";
import TextFile from "./TextFile";

interface Props {
    attachment: API.File;
    hasContent?: boolean;
}

const MAX_ATTACHMENT_WIDTH = 480;

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|weba)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i;

/** Work out what to render, trusting the file itself when metadata says "File". */
function detectKind(attachment: API.File): string {
    const type = attachment.metadata.type;
    if (type !== "File") return type;
    const mime = attachment.content_type ?? "";
    const name = attachment.filename ?? "";
    if (mime.startsWith("video/") || VIDEO_EXT.test(name)) return "LooseVideo";
    if (mime.startsWith("audio/") || AUDIO_EXT.test(name)) return "Audio";
    return type;
}

export default function Attachment({ attachment, hasContent }: Props) {
    const client = useClient();
    const { filename, metadata } = attachment;
    const [spoiler, setSpoiler] = useState(filename.startsWith("SPOILER_"));

    const url = client.generateFileURL(
        attachment,
        { width: MAX_ATTACHMENT_WIDTH * 1.5 },
        true,
    );

    switch (detectKind(attachment)) {
        case "LooseVideo": {
            return (
                <div
                    className={classNames(styles.container, {
                        [styles.margin]: hasContent,
                    })}>
                    <AttachmentActions attachment={attachment} />
                    <video
                        src={url}
                        controls
                        preload="metadata"
                        style={{ maxWidth: "100%", maxHeight: 400 }}
                    />
                </div>
            );
        }

        case "Image": {
            if (metadata.type !== "Image") return null;
            return (
                <SizedGrid
                    width={metadata.width}
                    height={metadata.height}
                    {...useTriggerEvents("Menu", {
                        attachment,
                    })}
                    className={classNames({
                        [styles.margin]: hasContent,
                        spoiler,
                    })}>
                    <ImageFile
                        attachment={attachment}
                        width={metadata.width}
                        height={metadata.height}
                    />
                    {spoiler && <Spoiler set={setSpoiler} />}
                </SizedGrid>
            );
        }

        case "Video": {
            if (metadata.type !== "Video") return null;
            return (
                <div
                    className={classNames(styles.container, {
                        [styles.margin]: hasContent,
                    })}
                    style={{ "--width": `${metadata.width}px` }}>
                    <AttachmentActions attachment={attachment} />
                    <SizedGrid
                        width={metadata.width}
                        height={metadata.height}
                        className={classNames({ spoiler })}>
                        <video
                            src={url}
                            alt={filename}
                            controls
                            loading="lazy"
                            width={metadata.width}
                            height={metadata.height}
                            onMouseDown={(ev) =>
                                ev.button === 1 && window.open(url, "_blank")
                            }
                        />
                        {spoiler && <Spoiler set={setSpoiler} />}
                    </SizedGrid>
                </div>
            );
        }

        case "Audio": {
            return (
                <div
                    className={classNames(styles.attachment, styles.audio)}
                    data-has-content={hasContent}>
                    <AttachmentActions attachment={attachment} />
                    <audio src={url} controls />
                </div>
            );
        }

        case "Text": {
            return (
                <div
                    className={classNames(styles.attachment, styles.text)}
                    data-has-content={hasContent}>
                    <TextFile attachment={attachment} />
                    <AttachmentActions attachment={attachment} />
                </div>
            );
        }

        default: {
            return (
                <div
                    className={classNames(styles.attachment, styles.file)}
                    data-has-content={hasContent}>
                    <AttachmentActions attachment={attachment} />
                </div>
            );
        }
    }
}
