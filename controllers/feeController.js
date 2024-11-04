require('dotenv').config();
const Fee = require('../model/FeeModel');
const crypto = require("crypto");
const algorithm = "aes-256-cbc";
const secretKey = process.env.ENCRYPTION_KEY; // Ensure this is defined in your environment
const ivLength = 16;

function encrypt(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid text for encryption");
  }
  if (!secretKey || typeof secretKey !== "string") {
    throw new Error("Encryption key is not defined or is not a string");
  }

  const iv = crypto.randomBytes(ivLength); // Generate a random IV
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  try {
    const textParts = text.split(":");
    if (textParts.length !== 2) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(textParts[0], "hex"); // Extract IV
    const encryptedText = Buffer.from(textParts[1], "hex"); // Extract the encrypted text

    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(secretKey, "hex"),
      iv
    );
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error("Failed to decrypt the text");
  }
}

const createFees = async (req, res) => {
  const { depositFee, withdrawalFee, serviceFee, anonymityFee, mixerPrivateKey, adminAddress,verifyPassword, password } = req.body;

  try {
    // Check if a Fee document already exists
    const existingFee = await Fee.findOne();
    if (existingFee) {
      return res.status(400).json({ message: 'Fee document already exists. Use the update endpoint instead.' });
    }

    // Encrypt mixerPrivateKey before storing
    const encryptedMixerPrivateKey = mixerPrivateKey ? encrypt(mixerPrivateKey) : null;

    // Create a new Fee document
    const newFee = new Fee({
      depositFee,
      withdrawalFee,
      serviceFee,
      anonymityFee,
      mixerPrivateKey: encryptedMixerPrivateKey || null, // Store the encrypted key
      adminAddress: adminAddress || null,       // Allow it to be null if not provided
      password,
      verifyPassword
    });

    // Save to the database
    await newFee.save();

    res.status(201).json({ message: 'Fee document created successfully' });
  } catch (error) {
    console.error('Error creating Fee document:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


const updateFees = async (req, res) => {
  const { depositFee, withdrawalFee, serviceFee, anonymityFee, mixerPrivateKey, adminAddress, password } = req.body;

  try {
    const feeDoc = await Fee.findOne();
    if (!feeDoc) {
      return res.status(404).json({ message: 'Fee document not found' });
    }

    // Verify password
    const isMatch = await feeDoc.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // Update fee fields only if they are provided in req.body
    if (depositFee !== undefined) {
      feeDoc.depositFee = depositFee;
    }
    if (withdrawalFee !== undefined) {
      feeDoc.withdrawalFee = withdrawalFee;
    }
    if (serviceFee !== undefined) {
      feeDoc.serviceFee = serviceFee;
    }
    if (anonymityFee !== undefined) {
      feeDoc.anonymityFee = anonymityFee;
    }
    if (mixerPrivateKey !== undefined) {
      feeDoc.mixerPrivateKey = encrypt(mixerPrivateKey); // Encrypt before updating
    }
    if (adminAddress !== undefined) {
      feeDoc.adminAddress = adminAddress; // Only update if provided
    }

    await feeDoc.save();

    res.status(200).json({ message: 'Fees updated successfully' });
  } catch (error) {
    console.error('Error updating fees:', error);
    res.status(500).json({ message: 'Server error' });
  }
};




const getFees = async (req, res) => {
  try {
    // Retrieve the fees document from the database
    const fees = await Fee.findOne();

    if (!fees) {
      return res.status(404).json({ message: "Fees not found" });
    }

    // Convert fees object to plain JavaScript object
    const { password, mixerPrivateKey, ...feesWithoutPassword } = fees.toObject();

    // Encrypt the mixerPrivateKey
    const encryptedMixerPrivateKey = decrypt(mixerPrivateKey);

    // Add the encrypted mixerPrivateKey to the response object
    feesWithoutPassword.mixerPrivateKey = encryptedMixerPrivateKey;

    // Return the fees data without the password
    res.status(200).json(feesWithoutPassword);
  } catch (error) {
    // Handle any errors that may occur
    console.error("Error retrieving fees:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const verifyPassword = async (req, res) => {
  const { verifyPassword } = req.body; // Get the verifyPassword from the request body

  try {
    // Fetch the existing fee document from the database
    const fee = await Fee.findOne(); // Assuming there is only one document

    // Check if the fee document exists
    if (!fee) {
      return res.status(404).json({ message: 'Fee document not found' });
    }

    // Compare the provided verifyPassword with the hashed verifyPassword in the database
    const isVerifyPasswordMatch = await fee.compareVerifyPassword(verifyPassword);

    if (isVerifyPasswordMatch) {
      return res.status(269).json({ message: 'Verify password is correct' });
    } else {
      return res.status(401).json({ message: 'Incorrect verify password' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};



module.exports = {
  updateFees,
  createFees,
  getFees,
  verifyPassword
};
