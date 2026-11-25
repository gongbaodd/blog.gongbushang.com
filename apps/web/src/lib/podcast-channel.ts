// The show itself (not an episode): constant, as in the legacy `podcast.json` channel. EmDash has no singleton entry
// for it and it has not changed in years; edit here if the show moves. Dependency-free on purpose: `fetch-podcast
// --emdash` imports it to warn when the RSS channel (title/description/image) no longer matches.
export const PODCAST_CHANNEL: { title: string; description: string; link: string; image: string } = {
	title: "给我整 growgen",
	description: "我是一个旅居爱沙尼亚的中国程序员，我在这里分享每周的编程经验和生活经历，内容是宁滥勿缺，所以想听的听，不想听的别听。",
	link: "https://podcasters.spotify.com/pod/show/growgen",
	image: "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/40922820/40922820-1754219676687-e0d3d11be8014.jpg",
};
