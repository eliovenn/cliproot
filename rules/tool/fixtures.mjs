// Synthetic HTTP contracts based on the pinned upstream extractors. No live credentials.
// Generate once for both Node and Dart/FJS; expectations are authored, not parser output.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const cases = [];
const img = 'https://media.example.com/photo.jpg', clip = 'https://media.example.com/video.mp4', audio = 'https://media.example.com/audio.m4a';
const body = '<p>Fixture body with <strong>important ideas</strong> and a <a href="/next">reference</a>.</p>';
const page = (html) => `<html><head><title>Fixture title</title></head><body>${html}</body></html>`;
const state = (name, data) => page(`<script>window.${name}=${JSON.stringify(data)};</script>`);
const script = (id, data) => page(`<script id="${id}" type="application/json">${JSON.stringify(data)}</script>`);
const route = (url, data, extra = {}) => ({url, method:'GET', status:200, body:typeof data === 'string' ? data : JSON.stringify(data), ...extra});
const add = (platform, name, url, routes, expected, extra = {}) => cases.push({platform,name,url,routes,expected,...extra});
const first = {'media.0.variants.0.url':img};
const aweme = {aweme_id:'123',desc:'Fixture video',video:{play_addr:{url_list:[clip],width:1920,height:1080},duration:4000}};
const player = {playabilityStatus:{status:'OK'},videoDetails:{videoId:'abcdefghijk',title:'Fixture video',shortDescription:'Fixture body'},streamingData:{adaptiveFormats:[
  {url:clip,mimeType:'video/mp4; codecs="avc1"',width:1920,height:1080,approxDurationMs:'4000'},
  {url:audio,mimeType:'audio/mp4; codecs="mp4a"',approxDurationMs:'4000'}]}};
add('bangumi','nested BBCode and blog photos','https://bgm.tv/blog/123',[
  route('/p1/blogs/123$',{title:'Fixture title',content:`[b]Fixture [i]body[/i][/b][img]${img}[/img]`}),
  route('/blogs/123/photos',{data:[{target:'extra.jpg'}]})],{'title':'Fixture title','media.length':2,...first},{contains:{markdown:'**Fixture *body***'}});
const view = {code:0,data:{bvid:'BV1234567890',title:'Fixture video',desc:'Fixture body',owner:{name:'Ada'},pages:[{cid:456,part:'Part one'}]}};
const play = {code:0,data:{dash:{duration:4,video:[{baseUrl:clip,width:1920,height:1080,mimeType:'video/mp4',backupUrl:[clip+'?backup=1']}],audio:[{base_url:audio,mime_type:'audio/mp4'}]}}};
add('bilibili','WBI video and audio tracks','https://www.bilibili.com/video/BV1234567890',[
  route('/x/web-interface/view',view), route('/x/web-interface/nav',{code:-101,data:{wbi_img:{img_url:'https://i.example.com/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i.example.com/4932caff0ff746eab6f01bf08b70ac45.png'}}}),
  route('/x/player/wbi/playurl.*w_rid=[0-9a-f]{32}',play)],{'title':'Fixture video','media.length':2,'media.0.variants.0.hasAudio':false,'media.1.kind':'audio','media.1.variants.0.hasVideo':false});
add('bilibili','empty WBI media retries legacy API','https://www.bilibili.com/video/BV1234567890',[
  route('/x/web-interface/view',view),route('/x/web-interface/nav',{}, {status:403}),route('/x/player/playurl',play)],{'media.length':2,'attempts.0.stage':'wbi-dash-api'});
add('bilibili','opus live photo','https://www.bilibili.com/opus/123',[
  route('/finger/spi',{code:0,data:{b_3:'test'}}),route('/web-dynamic/v1/detail',{code:0,data:{item:{modules:{module_dynamic:{major:{opus:{title:'Fixture title',summary:{text:'Fixture body'},pics:[{url:img,live_url:clip}]}}}}}}})],{'media.0.kind':'livePhoto','media.0.companionVideo.variants.0.url':clip});
add('coolapk','article DOM','https://www.coolapk.com/feed/123',[route('/feed/123',page(`<h1 class="message-title">Fixture title</h1><div class="feed-message">${body}<img src="${img}"></div>`))],{'title':'Fixture title',...first},{contains:{text:'Fixture body',markdown:'https://www.coolapk.com/next'}});
add('douban','topic animation and timed video','https://www.douban.com/group/topic/123',[route('/group/topic/123',{title:'Fixture title',content:body,photos:[{image:{is_animated:true,video:{url:clip},normal:{url:img}}}],video_info:{video_url:clip+'?main',duration:'01:02',cover_url:img}})],{'media.0.kind':'animation','media.1.variants.0.durationMs':62000});
add('douyin','web signed detail','https://www.douyin.com/video/123',[route('/aweme/v1/web/aweme/detail/.*a_bogus=',{aweme_detail:aweme})],{'text':'Fixture video','media.0.variants.0.url':clip});
add('douyin','mobile registration signature and Story redirect','https://www.douyin.com/video/123',[
  route('/aweme/v1/web/aweme/detail/',{}),route('iesdouyin.com/share/video/123',page('unavailable')),route('www.douyin.com/video/123',page('unavailable')),
  route('/service/2/device_register/',{device_id_str:'1234567890123456789',install_id_str:'9876543210123456789'},{method:'POST',requestHeaders:{'x-gorgon':'8404','x-argus':''}}),
  route('api.amemv.com/aweme/v1/aweme/detail/',{aweme_detail:{...aweme,is_story:true,video:{...aweme.video,play_addr:{uri:'story123',url_list:[clip]}}}},{requestHeaders:{'x-gorgon':'8404'}}),
  ...['default','1080p','720p','540p','480p'].flatMap((ratio) => [route(`/aweme/v1/play/.*ratio=${ratio}`, '', {method:'HEAD',status:302,headers:{location:[clip+`?ratio=${ratio}`]}}),route(`media.example.com/video.mp4\\?ratio=${ratio}`, '', {method:'HEAD',headers:{'content-length':['200']}})])
],{'media.0.variants.0.url':clip+'?ratio=default','attempts.0.stage':'web-api'});
const dash = `<MPD><BaseURL>https://media.example.com/</BaseURL><Period id="p"><AdaptationSet mimeType="video/mp4" codecs="avc1"><Representation height="1080"><BaseURL>video.mp4</BaseURL><SegmentBase indexRange="0-10"/></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation><BaseURL>audio.m4a</BaseURL></Representation></AdaptationSet></Period></MPD>`;
add('facebook','target ID excludes recommended video and splits DASH','https://www.facebook.com/watch/?v=123',[
  route('facebook.com/watch',page(`<script type="application/json">${JSON.stringify([{id:'999',playable_url:'https://media.example.com/wrong.mp4'},{id:'123',name:'Fixture video',dash_manifest:dash}])}</script>`))],{'title':'Fixture video','media.length':2,'media.0.variants.0.url':clip,'media.1.variants.0.url':audio});
add('facebook','only recommendation is unavailable','https://www.facebook.com/watch/?v=123',[
  route('facebook.com/watch',page('<script type="application/json">{"id":"999","playable_url":"https://media.example.com/wrong.mp4"}</script>'))],{}, {error:'contentUnavailable'});
add('instagram','carousel mixed media','https://www.instagram.com/p/ABC/',[
  route('instagram.com/$',page('csrf'),{headers:{'set-cookie':['csrftoken=fixture; Path=/; Secure']}}),
  route('/graphql/query',{data:{xdt_shortcode_media:{id:'123',caption:'Fixture body',edge_sidecar_to_children:{edges:[{node:{display_url:img}},{node:{video_url:clip,display_url:img}}]}}}},{method:'POST',requestHeaders:{'x-csrftoken':'fixture'},bodyContains:'doc_id='})],{'text':'Fixture body','media.0.kind':'image','media.1.kind':'video'});
add('kuaishou','atlas and multi-codec manifest','https://www.kuaishou.com/short-video/abc',[
  route('/short-video/abc',state('__APOLLO_STATE__',{defaultClient:{'VisionVideoDetailPhoto:abc':{caption:'Fixture title',ext_params:{atlas:{cdn:'media.example.com',list:['photo.jpg']}},manifest:{representation:[{url:clip,codecs:'avc1',height:1080}]}}}}))],{'title':'Fixture title','media.length':2,...first});
add('medium','paragraphs markup images and code','https://medium.com/@ada/fixture-0123456789ab',[route('/_/graphql',[{data:{post:{title:'Fixture title',content:{bodyModel:{paragraphs:[{type:'P',text:'Fixture body',markups:[{type:'STRONG',start:0,end:7}]},{type:'IMG',text:'Caption',metadata:{id:'image123'}},{type:'PRE',text:'print(1)',codeBlockMetadata:{lang:'python'}}]}}}}}],{method:'POST'})],{'media.0.variants.0.url':'https://miro.medium.com/v2/image123'},{contains:{markdown:'**Fixture** body'}});
add('pipix','RENDER_DATA video','https://h5.pipix.com/item/123',[
  route('/item/123',page(`<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify({ppxItemDetail:{item:{item_id:'123',item_type:2,content:'Fixture body',video:{video_download:{url_list:[clip],duration:4}}}}}))}</script>`))],{'text':'Fixture body','media.0.variants.0.durationMs':4000});
add('snapchat','Spotlight metadata','https://www.snapchat.com/spotlight/abc',[
  route('/spotlight/abc',script('__NEXT_DATA__',{props:{story:{storyId:{value:'abc'}},metadata:{description:'Fixture body',videoMetadata:{name:'Fixture video',contentUrl:clip,durationMs:4000}}}}))],{'title':'Fixture video','media.0.variants.0.url':clip});
add('threads','matching shortcode','https://www.threads.com/@ada/post/ABC',[
  route('threads.com/$',page('csrf'),{headers:{'set-cookie':['csrftoken=fixture; Path=/; Secure']}}),route('/graphql/query',{data:{items:[{code:'OTHER',media_type:1,caption:'Wrong'},{code:'ABC',media_type:1,caption:{text:'Fixture body'},image_versions2:{candidates:[{url:img}]}}]}},{method:'POST'})],{'text':'Fixture body',...first});
add('tieba','signed thread','https://tieba.baidu.com/p/123',[
  route('/dc/common/tbs',{tbs:'fixture'}),route('/c/f/pb/page_pc',{error_code:'0',thread:{origin_thread_info:{title:'Fixture title',content:[{type:0,text:'Fixture body'}],media:[{big_pic:img,width:'800',height:'600'}]}}},{method:'POST',bodyContains:'sign='})],{'title':'Fixture title','media.0.variants.0.width':800});
const challenge = {v:{a:Buffer.from('prefix').toString('base64'),c:createHash('sha256').update('prefix7').digest('base64')}};
add('tiktok','challenge then hydration','https://www.tiktok.com/@ada/video/123',[
  route('/@_/video/123',page(`<div id="cs" class="${Buffer.from(JSON.stringify(challenge)).toString('base64')}"></div><div id="wci" class="challenge"></div>`)),
  route('/@_/video/123',script('__UNIVERSAL_DATA_FOR_REHYDRATION__',{__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:{id:'123',desc:'Fixture video',video:{playAddr:clip,duration:4}}}}}}),{requestHeaders:{cookie:'challenge='}})],{'text':'Fixture video','media.0.variants.0.durationMs':4000});
add('toutiao','article embedded VOD','https://www.toutiao.com/article/123',[
  route('/i123/info/v2/',{data:{title:'Fixture title',content:body+`<div class="tt-video-box" data-token="${Buffer.from(JSON.stringify({GetPlayInfoToken:'token=fixture'})).toString('base64url')}"></div>`}}),
  route('vod.bytedanceapi.com/',{Result:{Data:{PlayInfoList:[{MainPlayUrl:clip,Height:'1080',Duration:'4'}]}}})],{'title':'Fixture title','media.0.variants.0.height':1080});
add('twitter','guest GraphQL long note','https://x.com/ada/status/123',[
  route('/1.1/guest/activate.json',{guest_token:'fixture'},{method:'POST'}),route('/TweetResultByRestId',{data:{tweetResult:{result:{rest_id:'123',legacy:{full_text:'Short',extended_entities:{media:[{type:'photo',media_url_https:img}]}},note_tweet:{note_tweet_results:{result:{text:'Fixture long note'}}}}}}})],{'text':'Fixture long note','media.0.variants.0.url':img+'?name=orig'});
add('twitter','syndication fallback','https://x.com/ada/status/123',[
  route('/1.1/guest/activate.json',{}, {method:'POST',status:403}),route('cdn.syndication.twimg.com/tweet-result',{id_str:'123',text:'Fixture body'})],{'text':'Fixture body','attempts.0.stage':'graphql'});
add('weibo','mixed live photo and repost','https://weibo.com/ada/123',[
  route('/ajax/statuses/show',{idstr:'123',text_raw:'Fixture body',mix_media_info:{items:[{type:'pic',data:{type:'livephoto',video:clip,largest:{url:img}}}]},retweeted_status:{idstr:'456',text_raw:'Quoted body'}})],{'media.0.kind':'livePhoto','media.0.companionVideo.variants.0.url':clip},{contains:{text:'Quoted body'}});
add('weixin','cgi article lazy image','https://mp.weixin.qq.com/s/abc',[
  route('/s/abc',state('cgiDataNew',{item_show_type:0,title:'Fixture title',content_noencode:body+`<img data-src="${img}">`}))],{'title':'Fixture title',...first});
// The reported article's first code block, without its full page or tracking data.
const codeHtml = await readFile(new URL('../../fixtures/weixin-mdnice-code.html',import.meta.url),'utf8');
const codeText = (await readFile(new URL('../../fixtures/weixin-mdnice-code.txt',import.meta.url),'utf8')).replace(/\n$/,'');
const codeExpected = {'markdown':`\`\`\`\n${codeText}\n\`\`\``,'text':codeText};
add('weixin','mdnice code via cgiDataNew','https://mp.weixin.qq.com/s/code-cgi',[
  route('/s/code-cgi',state('cgiDataNew',{item_show_type:0,title:'Fixture title',content_noencode:codeHtml}))],{'title':'Fixture title',...codeExpected});
add('weixin','mdnice code via article DOM fallback','https://mp.weixin.qq.com/s/code-dom',[
  route('/s/code-dom',page(`<h1 id="activity-name">Fixture title</h1><div id="js_content">${codeHtml}</div>`))],{'title':'Fixture title','attempts.0.stage':'cgiDataNew',...codeExpected});
add('weixin_channels','Yuanbao to Finder','https://weixin.qq.com/sph/abc',[
  route('/api/weixin/get_parse_result',{code:0,data:{playable_url:'https://channels.weixin.qq.com/preview?token=fixture&eid=123'}},{method:'POST'}),
  route('/api/feed/get_feed_info',{errCode:0,data:{feedInfo:{description:'Fixture video',videoUrl:clip}}},{method:'POST',bodyContains:'generalToken'})],{'title':'Fixture video','media.0.variants.0.url':clip});
add('xiaoheihe','device registration and original image','https://www.xiaoheihe.cn/app/bbs/link/123',[
  route('/deviceprofile/v4',{code:1100,detail:{deviceId:'fixture'}},{method:'POST',bodyContains:'"compress":2'}),
  route('/bbs/app/link/tree',{status:'ok',result:{link:{title:'Fixture title',text:JSON.stringify([{type:'text',text:'Fixture body'},{type:'img',url:'https://media.example.com/photo/thumb.jpg?size=1'}])}}},{requestHeaders:{cookie:'x_xhh_tokenid=Bfixture'}})],{'title':'Fixture title',...first});
const note = {noteId:'abc',title:'Fixture title',desc:'Fixture body',imageList:[{urlDefault:img,livePhoto:true,stream:{h264:[{masterUrl:clip,duration:4}]}}]};
add('xhs','live photo note','https://www.xiaohongshu.com/explore/abc',[
  route('/explore/abc',state('__INITIAL_STATE__',{note:{noteDetailMap:{abc:{note}}}}))],{'title':'Fixture title','media.0.kind':'livePhoto','media.0.companionVideo.variants.0.url':clip});
add('xhs','guest activation after page fallback','https://www.xiaohongshu.com/explore/abc',[
  route('/explore/abc',page('login')),route('/explore/abc',page('login')),
  route('/api/sns/web/v1/login/activate',{}, {method:'POST',requestHeaders:{'x-s':'XYS_','x-s-common':''},headers:{'set-cookie':['web_session=guest-fixture; Path=/; Secure']}}),
  route('/explore/abc',state('__INITIAL_STATE__',{note:{noteDetailMap:{abc:{note}}}}),{requestHeaders:{cookie:'web_session=guest-fixture'}})],{'title':'Fixture title','attempts.0.stage':'desktop-page'});
add('xhs','saved session is not replaced by guest','https://www.xiaohongshu.com/explore/abc',[
  route('/explore/abc',page('login')),route('/explore/abc',page('login'))],{}, {cookies:[{name:'web_session',value:'saved',domain:'.xiaohongshu.com'}],error:'authenticationRequired'});
add('youtube','watch player adaptive tracks','https://youtu.be/abcdefghijk',[
  route('/watch',state('ytInitialPlayerResponse',player))],{'title':'Fixture video','media.length':2,'media.0.variants.0.hasAudio':false,'media.1.kind':'audio'});
add('youtube','unavailable watch and WEB retry ANDROID_VR','https://www.youtube.com/watch?v=abcdefghijk',[
  route('/watch',state('ytInitialPlayerResponse',{videoDetails:{videoId:'abcdefghijk'},playabilityStatus:{status:'ERROR'}})),
  route('/youtubei/v1/player',{videoDetails:{videoId:'abcdefghijk'},playabilityStatus:{status:'ERROR'}},{method:'POST',bodyContains:'"WEB"'}),
  route('/youtubei/v1/player',player,{method:'POST',bodyContains:'"ANDROID_VR"'})],{'title':'Fixture video','attempts.0.code':'contentUnavailable','attempts.1.stage':'web-player'});
add('zhihu','signed answer cookie','https://www.zhihu.com/question/1/answer/123',[
  route('/api/v4/answers/123',{question:{title:'Fixture title'},content:body+`<img src="${img}">`,author:{name:'Ada'}},{requestHeaders:{'x-zse-96':'2.0_'}})],{'title':'Fixture title','author':'Ada',...first},{cookies:[{name:'d_c0',value:'fixture',domain:'.zhihu.com'}]});
add('zuiyou','image and video post','https://share.xiaochuankeji.cn/hybrid/share/post?pid=123',[
  route('/planck/share/post/detail_h5',{data:{post:{content:'Fixture body',imgs:[{id:1,urls:{original:{urls:[img]}}},{id:2,video:true,urls:{original:{urls:[img]}}}],videos:{'2':{url:clip}}}}},{method:'POST',bodyContains:'"pid":123'})],{'text':'Fixture body','media.0.kind':'image','media.1.kind':'video'});
const article = page(`<article><h1>Fixture title</h1>${body.repeat(8)}<img src="${img}"><script>alert('untrusted')</script></article>`);
add('generic_web','Readability relative links and sanitizing','https://reader.example.com/story',[
  route('/story',article)],{'title':'Fixture title',...first},{contains:{markdown:'https://reader.example.com/next'},absent:{html:'<script'}});
// Author contracts: each platform receives the native response field names.
const avatar = 'https://media.example.com/avatar.jpg';
const authorExpected = {'authorInfo.displayName':'Ada Lovelace','authorInfo.avatarUrl':avatar};
function authorCase(platform, index, edit, username = 'ada') {
  const f = cases.find((c) => c.platform === platform);
  const r = f.routes[index]; r.body = edit(r.body);
  Object.assign(f.expected,authorExpected,{'authorInfo.username':username});
}
const jsonEdit = (edit) => (raw) => {const data=JSON.parse(raw);edit(data);return JSON.stringify(data);};
authorCase('bangumi',0,jsonEdit((d)=>d.user={id:1,username:'ada',nickname:'Ada Lovelace',avatar:{large:avatar}}));
authorCase('bilibili',0,jsonEdit((d)=>d.data.owner={mid:1,name:'Ada Lovelace',face:avatar}),null);
authorCase('coolapk',0,(raw)=>raw.replace('</body>',`<a class="user-name" href="/u/1">Ada Lovelace</a><span class="user-avatar"><img src="${avatar}"></span></body>`),null);
authorCase('douban',0,jsonEdit((d)=>d.author={id:'1',uid:'ada',name:'Ada Lovelace',avatar}));
authorCase('douyin',0,jsonEdit((d)=>d.aweme_detail.author={uid:'1',unique_id:'ada',nickname:'Ada Lovelace',avatar_larger:{url_list:[avatar]}}));
authorCase('facebook',0,(raw)=>raw.replace('"id":"123","name"',`"id":"123","owner":${JSON.stringify({id:'1',username:'ada',name:'Ada Lovelace',profile_picture:{uri:avatar}})},"name"`));
authorCase('instagram',1,jsonEdit((d)=>d.data.xdt_shortcode_media.owner={id:'1',username:'ada',full_name:'Ada Lovelace',profile_pic_url:avatar}));
authorCase('kuaishou',0,(raw)=>raw.replace('"caption":"Fixture title"',`"author":${JSON.stringify({id:'1',kwaiId:'ada',name:'Ada Lovelace',headerUrl:avatar})},"caption":"Fixture title"`));
authorCase('medium',0,jsonEdit((d)=>d[0].data.post.creator={id:'1',username:'ada',name:'Ada Lovelace',imageId:'author-image'}));
cases.find((c)=>c.platform==='medium').expected['authorInfo.avatarUrl']='https://miro.medium.com/v2/author-image';
authorCase('pipix',0,(raw)=> {const data={ppxItemDetail:{item:{item_id:'123',item_type:2,content:'Fixture body',author:{id:'1',unique_id:'ada',name:'Ada Lovelace',avatar:{url_list:[avatar]}},video:{video_download:{url_list:[clip],duration:4}}}}};return page(`<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify(data))}</script>`);});
authorCase('snapchat',0,(raw)=>raw.replace('"name":"Fixture video"',`"creator":{"personCreator":${JSON.stringify({username:'ada',name:'Ada Lovelace',image:avatar})}},"name":"Fixture video"`));
authorCase('threads',1,jsonEdit((d)=>d.data.items[1].user={pk:'1',username:'ada',full_name:'Ada Lovelace',profile_pic_url:avatar}));
authorCase('tieba',1,jsonEdit((d)=>d.thread.author={id:'1',name:'ada',name_show:'Ada Lovelace',portrait:avatar}));
authorCase('tiktok',1,(raw)=>raw.replace('"id":"123","desc"',`"author":${JSON.stringify({id:'1',uniqueId:'ada',nickname:'Ada Lovelace',avatarLarger:avatar})},"id":"123","desc"`));
authorCase('toutiao',0,jsonEdit((d)=>d.data.user_info={user_id:'1',screen_name:'ada',name:'Ada Lovelace',avatar_url:avatar}));
authorCase('twitter',1,jsonEdit((d)=>d.data.tweetResult.result.core={user_results:{result:{rest_id:'1',legacy:{screen_name:'ada',name:'Ada Lovelace',profile_image_url_https:avatar}}}}));
authorCase('weibo',0,jsonEdit((d)=>d.user={idstr:'1',domain:'ada',screen_name:'Ada Lovelace',avatar_hd:avatar}));
authorCase('weixin',0,(raw)=>raw.replace('</body>',`<script>var nickname="Ada Lovelace";var alias="ada";var head_img="${avatar}";</script></body>`));
authorCase('weixin_channels',1,jsonEdit((d)=>d.data.authorInfo={id:'1',username:'ada',nickname:'Ada Lovelace',headUrl:avatar}));
authorCase('xiaoheihe',1,jsonEdit((d)=>d.result.link.user={userid:'1',username:'ada',nickname:'Ada Lovelace',avatar}));
authorCase('xhs',0,(raw)=>raw.replace('"noteId":"abc"',`"user":${JSON.stringify({userId:'1',redId:'ada',nickname:'Ada Lovelace',avatar})},"noteId":"abc"`));
authorCase('youtube',0,(raw)=>raw.replace('"title":"Fixture video"','"channelId":"UCfixture","author":"Ada Lovelace","title":"Fixture video"').replace('</body>',`<script>window.ytInitialData=${JSON.stringify({videoOwnerRenderer:{thumbnail:{thumbnails:[{url:avatar}]},navigationEndpoint:{browseEndpoint:{canonicalBaseUrl:'/@ada'}}}})};</script></body>`));
authorCase('zhihu',0,jsonEdit((d)=>d.author={id:'1',url_token:'ada',name:'Ada Lovelace',avatar_url:avatar}));
cases.find((c)=>c.platform==='zhihu').expected.author='Ada Lovelace';
authorCase('zuiyou',0,jsonEdit((d)=>d.data.post.member={id:'1',username:'ada',name:'Ada Lovelace',avatar}));
authorCase('generic_web',0,(raw)=>raw.replace('</head>',`<script type="application/ld+json">${JSON.stringify({'@type':'Article',author:{'@type':'Person',name:'Ada Lovelace',alternateName:'ada',image:avatar,url:'https://reader.example.com/ada'}})}</script></head>`));
await writeFile(new URL('../../fixtures/platforms.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
console.log(`Generated ${cases.length} shared HTTP fixtures`);
