import { collectBoard } from "../lib/collectors/smartrecruiters.mjs";
import { DEFAULT_PROFILE } from "../lib/profile.mjs";
import { scoreJob } from "../lib/matching.mjs";
const board = process.argv[2] || DEFAULT_PROFILE.boards[0];
try {
  const result = await collectBoard(board, DEFAULT_PROFILE);
  console.log(
    JSON.stringify(
      {
        ...result,
        seen: `${result.seen.length} identifiants`,
        jobs: result.jobs.map((j) => ({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          contract: j.contract_type,
          ...scoreJob(j),
        })),
      },
      null,
      2,
    ),
  );
  if (!result.complete) process.exitCode = 1;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
