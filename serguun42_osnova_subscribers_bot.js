const Telegraf = require("telegraf"),
	  NodeFetch = require("node-fetch").default,
	  fs = require("fs"),
	  util = require("util"),
	  fsStat = util.promisify(fs.stat),
	  fsWriteFile = util.promisify(fs.writeFile),
	  fsReadFile = util.promisify(fs.readFile);


/**
 * @param  {Error[] | String[]} args
 * @returns {void}
 */
const LogMessageOrError = (...args) => {
	const containsAnyError = (args.findIndex((message) => message instanceof Error) > -1),
		  out = (containsAnyError ? console.error : console.log);

	out(new Date());
	args.forEach((message) => out(message));
	out("~~~~~~~~~~~\n\n");
};

const TGE = iStr => {
	if (!iStr) return "";

	if (typeof iStr === "string")
		return iStr
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStr.toString());
};


const {
	SITES,
	TELEGRAM,
	USER_AGENT
} = require("./serguun42_osnova_subscribers_bot.config.json");


const telegraf = new Telegraf.Telegraf(TELEGRAM.TOKEN);
const telegram = telegraf.telegram;


/**
 * @typedef {import("./subscribers-types").LocalSubscriber[]} Subs
 */
/**
 * @param {string} siteShortName
 * @param {Subs} allFreshUsers
 * @returns {Promise<Subs>}
 */
const CompareOldToNew = (siteShortName, allFreshUsers) => {
	const siteFile = `./previous-data/${siteShortName}.json`;
	
	return new Promise((comparingResolve) => {
		fsStat(siteFile)
		.then(() => fsReadFile(siteFile))
		.then((siteFile) => {
			try {
				const parsedJSON = JSON.parse(siteFile.toString());
				return Promise.resolve(parsedJSON);
			} catch (e) {
				return Promise.reject(e);
			}
		})
		.then(/** @param {Subs} allPreviousSubscribers */ (allPreviousSubscribers) => {
			const previousFlattened = allPreviousSubscribers.map(({ user_id }) => user_id),
				  freshFlattened = allFreshUsers.map(({ user_id }) => user_id);


			/** @type {Subs} */
			const left = allPreviousSubscribers
						.filter((previousOne) => freshFlattened.indexOf(previousOne.user_id) == -1)
						.map((user) => ({ ...user, type: "left" }));

			/** @type {Subs} */
			const joined = allFreshUsers
							.filter((freshOne) => previousFlattened.indexOf(freshOne.user_id) === -1)
							.map((user) => ({ ...user, type: "joined" }));

			return fsWriteFile(siteFile, JSON.stringify(allFreshUsers, false, "\t"))
			.then(() => comparingResolve(left.concat(joined)))
			.catch(LogMessageOrError);;
		})
		.catch(() => {
			return fsWriteFile(siteFile, JSON.stringify(allFreshUsers, false, "\t"))
			.then(() => comparingResolve(allFreshUsers))
			.catch(LogMessageOrError);
		});
	});
}


let sitesCounter = 0;

/** @type {string[]} */
const sitesTexts = [];

/**
 * @param {string} iText
 * @returns {void}
 */
const AddSiteToQueue = iText => {
	if (iText) sitesTexts.push(iText);
	if (++sitesCounter !== SITES.length) return;

	if (!sitesTexts.length) return LogMessageOrError("No change in subscribers");

	const joinedTextForMessage = sitesTexts.join("\n\n");
	if (!joinedTextForMessage.length) return LogMessageOrError("No change in subscribers");


	telegram.sendMessage(TELEGRAM.CHANNEL, `Подписчики:\n\n${joinedTextForMessage.slice(0, 4000)}\n\n#subscribers`, {
		disable_web_page_preview: true,
		parse_mode: "HTML"
	})
	.then(() => LogMessageOrError("Send to Telegram subscribers"))
	.catch(LogMessageOrError);
}


SITES.forEach((site) => {
	/** @type {Subs} */
	const siteUsers = [];
	
	/**
	 * @param {number | string} lastId
	 * @param {number | string} lastSortingValue
	 */
	const LocalFetchSubs = (lastId, lastSortingValue) => {
		const urlToFetch = new URL(`subsite/subscribers?subsiteId=${site.user_id}${lastId ? "&lastId=" + lastId : ""}${lastSortingValue ? "&lastSortingValue=" + lastSortingValue : ""}`, site.api_domain);

		NodeFetch(urlToFetch.href, {
			method: "GET",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"X-Device-Token": site.token,
				"User-Agent": USER_AGENT
			}
		})
		.then((res) => {
			if (res.status === 200)
				return res.json();
			else
				return Promise.reject(`${urlToFetch.href}: Status code ${res.status} ${res.statusText}`);
		})
		.then(/** @param {import("./subscribers-types").ApiResponse} json */ (json) => {
			if (!json.result) return Promise.reject(`No valid json`);

			if (json.result?.items?.length) {
				json.result.items.forEach((userFromAPI) => siteUsers.push({
					user_id: userFromAPI.id,
					user_name: userFromAPI.name
				}));


				LocalFetchSubs(json.result.lastId, json.result.lastSortingValue);
			} else {
				CompareOldToNew(site.shortname, siteUsers)
				.then((listOfChanges) => {
					LogMessageOrError(`Compaired ${site.shortname}. Number of site's changes: ${listOfChanges.length}`);

					if (!listOfChanges) return AddSiteToQueue(null);
					if (!listOfChanges.length) return AddSiteToQueue(null);

					const textFromSite = `<b>${site.name}</b>\n\n${
						listOfChanges.map((subscriber) =>
							`<a href="${TGE(new URL("/u/" + subscriber.user_id, site.domain))}">${TGE(subscriber.user_name)}</a> <i>${subscriber.type === "joined" ? "подписался" : "отписался"}</i>`
						).join("\n")
					}`;

					AddSiteToQueue(textFromSite);
				});
			}
		})
		.catch(LogMessageOrError);
	}


	LocalFetchSubs();
});
