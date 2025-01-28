/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['ark-endfield'],
  tagFormat: 'ef-v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/github',
    // [
    //   'semantic-release-discord-bot',
    //   {
    //     notifications: [
    //       {
    //         branch: 'main',
    //       },
    //     ],
    //   },
    // ],
    [
      '@semantic-release/exec',
      {
        successCmd:
          './scripts/write-release-info.sh ${nextRelease.version} ${branch.name} ${(new Date()).toISOString()} ${nextRelease.gitTag}',
      },
    ],
  ],
};
