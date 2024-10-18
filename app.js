const express = require('express')
const { createAuthenticatedClient } = require('@interledger/open-payments');

const app = express()
const port = 3000

app.get('/payment', (req, res) => {
  handlePayment(res, req.query.amount, req.query.from, req.query.to);
})

app.get('/', (req, res) => {
    res.send("POESKLAP");
})

async function handlePayment(res, amount, wallet_from, wallet_to) {
    // 1. Get a grant for an incoming payment
    console.log(amount);
    console.log(wallet_from);
    console.log(wallet_to);
    const client = await createAuthenticatedClient({
        walletAddressUrl: "https://ilp.rafiki.money/fakecompany",
        privateKey:"private.key",
        keyId: "884142b6-cd4d-4cc6-8e13-f9c13042e704"
    })

    const receivingWalletAddress = await client.walletAddress.get({
        url: wallet_to
    })

    const sendingWalletAddress = await client.walletAddress.get({
        url:wallet_from
    })

    const incomingPaymentGrant = await client.grant.request({
        url: receivingWalletAddress.authServer
    }, 

    {access_token: {
        access: [{
            type: "incoming-payment",
            actions: ['create'] // just want to create
        }]
    }})

    // 2. Create an incoming payment
    const incomingPayment = await client.incomingPayment.create({
        url: receivingWalletAddress.resourceServer,
        accessToken: incomingPaymentGrant.access_token.value
    }, {
        walletAddress: receivingWalletAddress.id,
        incomingAmount:{
            assetCode: receivingWalletAddress.assetCode,
            assetScale: receivingWalletAddress.assetScale,
            value: amount,
        }
    });

    // 3. Get a grant for a quote
    const quoteGrant = await client.grant.request({
        url: sendingWalletAddress.authServer
    }, {
        access_token:{
            access:[{
                type: "quote",
                actions:['create']
            }]
        }
    })

    // 4. Create a quote
    const quote = await client.quote.create({
        url: sendingWalletAddress.resourceServer,
        accessToken: quoteGrant.access_token.value
    }, {
        walletAddress: sendingWalletAddress.id,
        receiver: incomingPayment.id,
        method:'ilp'
    })
    
    // 5. Get a grant for an outgoing payment
    const outgoingPaymentGrant = await client.grant.request({
        url: sendingWalletAddress.authServer
    }, {
        access_token:{
            access:[{
                type: "outgoing-payment",
                actions:['create'],
                limits: {
                    debitAmount: quote.debitAmount
                },
                identifier: sendingWalletAddress.id,
            }]
        },
        interact:{
            start: ["redirect"]
        }
    })

    // 6. User interaction send back the redirect uri
    console.log(outgoingPaymentGrant);
    res.send(JSON.stringify(outgoingPaymentGrant.interact.redirect));
    // 7. Continue outgoing payment grant 
    await retryCompletePayment(client, outgoingPaymentGrant, sendingWalletAddress, quote);
}

async function completePayment(client, outgoingPaymentGrant, sendingWalletAddress, quote) {
    // Your async task here, e.g., making an API call
    const finalisedOutgoingPayment = await client.grant.continue({
        url: outgoingPaymentGrant.continue.uri,
        accessToken:outgoingPaymentGrant.continue.access_token.value,
    });
    if(!finalisedOutgoingPayment.access_token){
        throw new Error("Not yet accepted");
    }
    else{
        // finalise payment here // 
        console.log("Grant received");
        console.log(finalisedOutgoingPayment)
        console.log("Quote:");
        console.log(quote);
        const outgoingPayment = await client.outgoingPayment.create({
            url: sendingWalletAddress.resourceServer,
            accessToken: finalisedOutgoingPayment.access_token.value,
        }, {
            walletAddress: sendingWalletAddress.id,
            quoteId: quote.id,
        })
        console.log(outgoingPayment);
        console.log("Payment confirmed");
    }
  }
  
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function retryCompletePayment(client, outgoingPaymentGrant, sendingWalletAddress, quote) {
    await wait(1000);   // Wait for 1 second (1000 ms)
    try{
        await completePayment(client, outgoingPaymentGrant, sendingWalletAddress, quote);
    }
    catch(err){
        if(err.message === "Not yet accepted"){
            await retryCompletePayment(client, outgoingPaymentGrant, sendingWalletAddress, quote);  // Retry the task
        }
        else{
            console.log(err.message)
        }
    }
  }

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})