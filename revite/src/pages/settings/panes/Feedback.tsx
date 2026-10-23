import styles from "./Panes.module.scss";

import { Column, Tip } from "@revoltchat/ui";

export function Feedback() {
    return (
        <Column>
            <Tip palette="warning">
                <span>
                    Feedback and bug reports for this NullCord instance are
                    handled by the administrators of this server. Please reach
                    out to them directly if you would like to suggest a feature
                    or report an issue.
                </span>
            </Tip>
            <div className={styles.feedback} />
        </Column>
    );
}
