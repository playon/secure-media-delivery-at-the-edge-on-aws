import AWS from "aws-sdk";

const mockgetSecretValue = jest.fn((SecretId) => {
  switch (SecretId) {
    case "secret1":
      return {
        SecretString: "secret-1-value",
      };
    case "secret2":
      return {
        SecretString: "secret-2-value",
      };
    default:
      throw Error("secret not found");
  }
});

jest.mock("aws-sdk", () => {
  return {
    config: {
      update() {
        return {};
      },
    },
    SecretsManager: jest.fn(() => {
      return {
        getSecretValue: jest.fn(({ SecretId }) => {
          return {
            promise: () => mockgetSecretValue(SecretId),
          };
        }),
      };
    }),
  };
});
