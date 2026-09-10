export const VIDEO_STREAMS_SUBSCRIPTION = `
  subscription VideoStreams {
    user_camera {
      streamId
      user {
        name
        userId
      }
      voice {
        talking
      }
    }
  }
`;

export interface VideoStreamsSubscriptionResult {
  user_camera?: {
    streamId: string
    user: {
      name: string
      userId: string
    };
    voice?: {
      talking: boolean;
    };
  }[];
}

export const USERS_SUBSCRIPTION = `
  subscription Users($limit: Int) {
    user(
      where: {
        isSharingCamera: { _eq: false },
      },
      limit: $limit,
      order_by: [
        { nameSortable: asc },
        { userId: asc },
      ],
    ) {
      userId
      name
      avatar
      color
      voice {
        talking
      }
    }
  }
`;

export interface UsersSubscriptionResult {
  user?: {
    userId: string;
    name: string | null;
    avatar: string | null;
    color: string | null;
    voice?: { talking: boolean };
  }[];
}

export const SCREENSHARE = `
  subscription Screenshare {
    screenshare {
      stream
    }
  }
`;

export interface ScreenshareSubscriptionResult {
  screenshare: {
    stream: string;
  }[];
}
