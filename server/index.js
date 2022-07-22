const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const { GraphQLClient, gql } = require("graphql-request");
const PORT = process.env.PORT || 3000;
const indexPath = path.resolve(__dirname, "..", "build", "index.html");

const AccountType = {
  user: "user",
  vault: "vault",
};

const GET_ASSET_MVS = gql`
  query GetAssetMVs(
    $buyout: [BuyoutStatus]
    $filter: AssetMVInput
    $offset: Int
    $limit: Int
  ) {
    getAssetMVs(
      buyout: $buyout
      filter: $filter
      offset: $offset
      limit: $limit
    ) {
      ... on AssetMVs {
        data {
          createdAt
          all_time_volume
          hr_24_volume
          valuation
          price
          assetCDNURL
          tokenURI
          tokenId
          type
          buyout
          vaultAddress
          assetAddress
          ownerAddress
        }
        total
      }
      ... on InvalidInputParamError {
        error
      }
      ... on InternalError {
        error
      }
    }
  }
`;

const GET_VAULT = gql`
  query GetVault(
    $vaultAddress: String
    $assetAddress: String
    $curatorAddress: String
    $name: String
    $offset: Int
    $symbol: String
    $limit: Int
  ) {
    getVaults(
      vaultAddress: $vaultAddress
      assetAddress: $assetAddress
      curatorAddress: $curatorAddress
      name: $name
      offset: $offset
      symbol: $symbol
      limit: $limit
    ) {
      ... on Vaults {
        data {
          vaultAddress
          assetAddress
          name
          symbol
          initialSupply
          initialPrice
          totalSupply
          secondaryReserveRatio
          secondaryReserveBalance
          primaryReserveBalance
          curatorFee
          price
          createdAt
          valuation
          updatedAt
          curatorAddress
          buyoutEndTime
          verified
        }
        total
      }
      ... on InternalError {
        error
      }
    }
  }
`;

const GET_ACCOUNTS = gql`
  query GetAccounts(
    $address: String
    $type: AccountType
    $offset: Int
    $limit: Int
  ) {
    getAccounts(
      address: $address
      type: $type
      offset: $offset
      limit: $limit
    ) {
      ... on Accounts {
        data {
          address
          username
          type
          twitter
          discord
          telegram
          email
          externalUrl
          pic
          coverPic
          bio
          tokenGatedBalance
        }
        total
      }
      ... on InternalError {
        error
      }
    }
  }
`;

async function getVaultDetails(vaultAddress) {
  try {
    const graphQLClient = new GraphQLClient("https://api.staging.nibbl.xyz/");
    let vaultDataPromises = [];
    vaultDataPromises.push(
      graphQLClient.request(GET_ACCOUNTS, {
        address: vaultAddress,
        type: AccountType.vault,
      })
    );
    vaultDataPromises.push(
      graphQLClient.request(GET_VAULT, {
        vaultAddress: vaultAddress,
      })
    );
    vaultDataPromises.push(
      graphQLClient.request(GET_ASSET_MVS, {
        filter: {
          vaultAddress: vaultAddress,
        },
      })
    );
    const vaultData = await Promise.all(vaultDataPromises);
    const vaultName = vaultData[1].getVaults.data[0].name;
    const vaultSymbol = vaultData[1].getVaults.data[0].symbol;
    const vaultImage = vaultData[2].getAssetMVs.data[0].assetCDNURL;
    const vaultDescription = vaultData[0].getAccounts.data[0].bio;

    console.log(vaultName, vaultSymbol, vaultImage, vaultDescription);

    return {
      success: true,
      data: {
        name: vaultName,
        symbol: vaultSymbol,
        image: vaultImage,
        description: vaultDescription,
      },
      error: null,
    };
  } catch (e) {
    console.log("Error in getVaultDetails - ", e);
    return {
      success: false,
      data: {
        name: "",
        symbol: "",
        image: "",
        description: "",
      },
      error: e,
    };
  }
}

// static resources should just be served as they are
app.use(
  express.static(path.resolve(__dirname, "..", "build"), { maxAge: "30d" })
);

// here we serve the index.html page
app.get("/*", async (req, res, next) => {
  try {
    fs.readFile(indexPath, "utf8", async (err, htmlData) => {
      try {
        if (err) {
          console.error("Error during file reading", err);
          return res.status(404).end();
        }
        const vaultAddress = req.originalUrl.split("/")[2];
        console.log(vaultAddress, "<--vaultAddress-->");
        const { success, data } = await getVaultDetails(vaultAddress);

        if (!success) return res.status(404).send("Post not found");

        if (success) {
          // inject meta tags
          htmlData = htmlData
            .replace("<title>React App</title>", `<title>${data.name}</title>`)
            .replace("__META_OG_TITLE__", data.name)
            .replace("__META_OG_DESCRIPTION__", data.description)
            .replace("__META_DESCRIPTION__", data.description)
            .replace("__META_OG_IMAGE__", data.image);
          // inject data
          return res.send(htmlData);
        } else {
          throw new Error("Error in getVaultDetails");
        }
      } catch (e) {
        console.log(e);
      }
    });
  } catch (e) {
    console.log(e);
  }
});

// listening...
app.listen(PORT, (error) => {
  if (error) {
    return console.log("Error during app startup", error);
  }
  console.log("listening on " + PORT + "...");
});
