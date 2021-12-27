import 'source-map-support/register';
import { useCachedFunctions } from '../lib/cache/fn-cache';
import Engine from "../lib/engine/engine";
import { IO } from "../lib/io/io";
import Slack from "../lib/io/slack";
import log from '../lib/log/logger';
import { Database } from "../lib/model/database";
import { cli } from "../lib/parameters/cli-args";
import env from "../lib/parameters/env-config";
import { AttachableError, KnownError } from "../lib/util/errors";
import run from "../lib/util/runner";

main();
async function main() {

  log.setLevelFrom(cli.get('--loglevel'));
  useCachedFunctions(cli.get('--cached-fns')?.split(','));

  const io = new IO({
    in: cli.getChoiceOrFail('--in', ['local', 'remote']),
    out: cli.getChoiceOrFail('--out', ['local', 'remote']),
  });
  cli.failIfExtraOpts();

  const slack = new Slack();

  await slack.postToSlack(`Starting Marketing Engine`);

  await run({

    async work() {
      const db = new Database(io);
      await new Engine().run(db);
    },

    async failed(errors) {
      await slack.postToSlack(`Failed ${env.engine.retryTimes} times. Below are the specific errors, in order. Trying again in ${env.engine.runInterval}.`);
      for (const error of errors) {
        if (error instanceof KnownError) {
          await slack.postErrorToSlack(error.message);
        }
        else if (error instanceof AttachableError) {
          await slack.postErrorToSlack(`\`\`\`\n${error.stack}\n\`\`\``);
          await slack.postAttachmentToSlack({
            title: 'Error attachment for ^',
            content: error.attachment,
          });
        }
        else {
          await slack.postErrorToSlack(`\`\`\`\n${error.stack}\n\`\`\``);
        }
      }
    },

  });

}
