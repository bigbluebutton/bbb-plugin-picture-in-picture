export interface VideoStreamsSubscriptionResult {
    user_camera?: {
      streamId: string
      user: {
        name: string
        userId: string
      };
    }[];
}
