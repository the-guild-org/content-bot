import { Probot } from "probot";
import { Client, LogLevel } from "@notionhq/client";
import RevueClient from "twitter-revue-client";

const revueClient = new RevueClient({ token: process.env.REVUE_API_TOKEN! });

const authorizedUsers = (process.env.AUTHORIZED_USERS || "").split(",");

const contentTypes = ["newsletter", "content", "blog", "tweet"] as const;
type ContentType = typeof contentTypes[number];

function isValidContentType(type: string): type is ContentType {
  return contentTypes.includes(type as any);
}

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

async function addItemToNotion({
  title,
  content,
  link,
  contentTypes,
  newsletterCurrentIssueTitle,
}: {
  title: string;
  link: string;
  content: string;
  contentTypes: ContentType[];
  newsletterCurrentIssueTitle?: string;
}) {
  try {
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID! },
      properties: {
        Title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
        ...(newsletterCurrentIssueTitle
          ? {
              NewsletterIssue: {
                rich_text: [
                  {
                    text: {
                      content: newsletterCurrentIssueTitle,
                    },
                  },
                ],
              },
            }
          : {}),
        AddedOn: {
          date: {
            start: new Date().toISOString(),
          },
        },
        Type: {
          multi_select: contentTypes.map((ct) => ({ name: ct })),
        },
        Status: {
          select: {
            name: "To be reviewed",
          },
        },
        Content: {
          rich_text:
            content === link
              ? [
                  {
                    type: "text",
                    text: {
                      link: { url: link },
                      content,
                    },
                  },
                ]
              : [
                  {
                    type: "text",
                    text: {
                      content,
                    },
                  },
                  {
                    type: "text",
                    text: {
                      content: "",
                    },
                  },
                  {
                    type: "text",
                    text: {
                      link: { url: link },
                      content: link,
                    },
                  },
                ],
        },
      },
    });
    console.log("Success! Entry added.");
  } catch (error: any) {
    console.error(error.body);
  }
}

const ACTION_REGEX = /^\/([\w]+)\b *(.*)?$/m;

function extractContentTypes(content: string): null | ContentType[] {
  const match = content.trim().match(ACTION_REGEX);
  if (match && match[1] === process.env.BOT_USERNAME) {
    return match[2].split(" ") as ContentType[];
  } else {
    return null;
  }
}

function cleanQuoteComment(body: string) {
  if (
    body
      .trim()
      .split("\n")
      .every((line) => line.startsWith(">"))
  ) {
    return body.replace(/^\>/gm, "");
  }
  return body;
}

function extractContent(
  content: string,
  link: string
): [type: "comment" | "issue", content: string] {
  const remaning = content.replace(ACTION_REGEX, "").trim();

  if (remaning.length === 0) {
    return ["issue", link];
  }

  return ["comment", `${cleanQuoteComment(remaning)}`];
}

export = (app: Probot) => {
  app.on(
    ["issue_comment.created", "issues.opened", "pull_request.opened"],
    async (context) => {
      let link: string | null = null;
      let body: string | null = null;
      let title: string | null = null;
      let user: string | null = null;

      switch (context.name) {
        case "issue_comment":
          link = context.payload.issue.html_url;
          user = context.payload.comment.user.login;
          body = context.payload.comment.body;
          title = context.payload.issue.title;
          break;
        case "issues":
          link = context.payload.issue.html_url;
          user = context.payload.issue.user.login;
          body = context.payload.issue.body;
          title = context.payload.issue.title;
          break;
        case "pull_request":
          title = context.payload.pull_request.title;
          link = context.payload.pull_request.html_url;
          user = context.payload.pull_request.user.login;
          body = context.payload.pull_request.body;
          break;
        default:
          break;
      }

      if (link && body && user && title) {
        if (!authorizedUsers.includes(user)) {
          return;
        }

        const contentTypes = extractContentTypes(body);

        console.log(contentTypes, extractContentTypes(body));

        if (!contentTypes) {
          console.warn(`unable to process "${body}"`);
          return;
        }

        let newsletterCurrentIssueTitle;

        if (contentTypes.includes("newsletter")) {
          const currentIssue = (
            (await revueClient.getCurrentIssue()) as any
          )[0];
          newsletterCurrentIssueTitle =
            currentIssue.subject || "next newsletter issue";
        }

        const [type, content] = extractContent(body, link);
        await addItemToNotion({
          title,
          link,
          content,
          contentTypes,
          newsletterCurrentIssueTitle,
        });

        contentTypes.forEach(async (contentType) => {
          if (!isValidContentType(contentType)) {
            const issueComment = context.issue({
              body: `⚠️ @${user}, "${contentType}" content type is not recognized, please use one of the following: ${contentTypes.join(
                ", "
              )}.`,
            });
            await context.octokit.issues.createComment(issueComment);
          } else if (contentType === "newsletter") {
            const currentIssue = (
              (await revueClient.getCurrentIssue()) as any
            )[0];
            const newsletterCurrentIssueTitle =
              currentIssue.subject || "next newsletter issue";

            const issueComment = context.issue({
              body: `@${user}, ${type} saved for the ${newsletterCurrentIssueTitle}! ⚡️`,
            });
            await context.octokit.issues.createComment(issueComment);
          } else {
            const issueComment = context.issue({
              body: `@${user}, ${type} saved for the ${contentType}! ⚡️`,
            });
            await context.octokit.issues.createComment(issueComment);
          }
        });
      }
    }
  );
};
