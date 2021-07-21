export type LocalSubscriber = {
	type?: "joined" | "left",
	user_id: number;
	user_name: string;
}

type Data = {
	uuid: string;
	width: number;
	height: number;
	size: number;
	type: string;
	color: string;
	hash: string;
	external_service: any[];
}

type Avatar = {
	type: string;
	data: Data;
}

type UserFromAPI = {
	id: number;
	name: string;
	avatar: Avatar;
	isSubscribed: boolean;
	isFavorited: boolean;
}

export type ApiResponse = {
	message: string;
	result: {
		items: UserFromAPI[];
		lastId: number;
		lastSortingValue: string;
	};
}
