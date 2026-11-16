import { graphql, metaPost, shortcodeId } from '../sdk/meta.js';
import { requireValue, find } from '../sdk/core.js';
const providers = 'HasPermalinkIndentation IsLoggedIn HasPostAuthorNotifControls ShouldShowFediverseM1Features HasPermalinkPodcastCard HasDearAlgoConsumption HasEventBadge GenAIRepliesEnabled IsSearchDiscoveryEnabled HasCommunities HasGameScoreShare HasPublicViewCountCard HasCommunityEntityCard HasScorecardCommunity HasSportTeamAllegianceCard HasMusic HasNewspaperLinkStyle HasMessaging HasPodcastTextFragments ShouldFulfillLightboxQuery HasViewerReplied HasPrivateRepliesDeprecation HasGhostPostEmojiActivation OptionalCookiesEnabled HasDearAlgoWebProduction HasWebFavicons IsCrawler HasCommunityTopContributors CanSeeSponsoredContent ShouldShowFediverseM075Features IsInternalUser'.split(' ');
export default async function extract({ url, options }) {
  const code = requireValue(new URL(url).pathname.match(/\/post\/([\w-]+)/)?.[1], 'unsupportedUrl');
  const variables = { postID: shortcodeId(code) };
  for (const p of providers) variables[`__relay_internal__pv__Barcelona${p}relayprovider`] = false;
  const data = await graphql('https://www.threads.com/', '238260118697367', options.docId || '27419285281047858', variables);
  return metaPost(requireValue(find(data, (n) => n.code === code && n.media_type !== undefined), 'authenticationRequired'), 'https://www.threads.com/@');
}
