import { Probot } from "probot";
import { Client, LogLevel } from "@notionhq/client";
import RevueClient from "twitter-revue-client";

const revueClient = new RevueClient({ token: process.env.REVUE_API_TOKEN! });

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

async function addItemToNotion(
  title: string,
  url: string,
  content: string,
  newsletterCurrentIssueTitle: string
) {
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
        NewsletterIssue: {
          rich_text: [
            {
              text: {
                content: newsletterCurrentIssueTitle,
              },
            },
          ],
        },
        AddedOn: {
          date: {
            start: new Date().toISOString(),
          },
        },
        Type: {
          select: {
            name: "newsletter",
          },
        },
        Status: {
          select: {
            name: "To be reviewed",
          },
        },
        Content: {
          rich_text:
            content === url
              ? [
                  {
                    type: "text",
                    text: {
                      link: { url },
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
                      link: { url },
                      content: url,
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

const NEWSLETTER_ACTION = "/the-guild newsletter";
const CONTENT_ACTION = "/the-guild content";

function isValidAction(content: string) {
  return (
    content.includes(NEWSLETTER_ACTION) || content.includes(CONTENT_ACTION)
  );
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
  const remaning = content.replace(NEWSLETTER_ACTION, "").trim();

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

      if (link && body && user && title && isValidAction(body)) {
        const [type, content] = extractContent(body, link);

        const currentIssue = ((await revueClient.getCurrentIssue()) as any)[0];
        const newsletterCurrentIssueTitle =
          currentIssue.subject || "next newsletter issue";

        const issueComment = context.issue({
          body: `@${user}, ${type} saved for the ${newsletterCurrentIssueTitle}! ⚡️`,
        });
        await addItemToNotion(
          title,
          link,
          content,
          newsletterCurrentIssueTitle
        );
        await context.octokit.issues.createComment(issueComment);
      }
    }
  );
};
