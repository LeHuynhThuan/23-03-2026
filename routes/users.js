var express = require("express");
var router = express.Router();
let { postUserValidator, validateResult } = require('../utils/validatorHandler')
let userController = require('../controllers/users')
let cartModel = require('../schemas/cart');
let { checkLogin, checkRole } = require('../utils/authHandler.js')
let { uploadExcel } = require('../utils/uploadHandler')
let roleModel = require('../schemas/roles')
let mailHandler = require('../utils/sendMailHandler')
let excelJS = require('exceljs')
let path = require('path')
let fs = require('fs')
let crypto = require('crypto')

let userModel = require("../schemas/users");
const { default: mongoose } = require("mongoose");

function getCellText(row, index) {
  return `${row.getCell(index).text || ''}`.trim();
}

function createRandomPassword(length = 16) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=';
  const allChars = `${lowercase}${uppercase}${numbers}${symbols}`;
  const requiredChars = [
    lowercase[crypto.randomInt(lowercase.length)],
    uppercase[crypto.randomInt(uppercase.length)],
    numbers[crypto.randomInt(numbers.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  while (requiredChars.length < length) {
    requiredChars.push(allChars[crypto.randomInt(allChars.length)]);
  }

  for (let index = requiredChars.length - 1; index > 0; index--) {
    const swapIndex = crypto.randomInt(index + 1);
    const current = requiredChars[index];
    requiredChars[index] = requiredChars[swapIndex];
    requiredChars[swapIndex] = current;
  }

  return requiredChars.join('');
}

async function importSingleUser({ username, email, roleId, roleName }) {
  const password = createRandomPassword(16);

  try {
    const newUser = await userController.CreateAnUser(
      username,
      password,
      email,
      roleId
    )
    const newCart = new cartModel({
      user: newUser._id
    })
    try {
      await newCart.save()
    } catch (cartError) {
      await userModel.findByIdAndDelete(newUser._id)
      throw cartError
    }

    try {
      await mailHandler.sendImportedUserPasswordMail({
        to: email,
        username,
        password,
        role: roleName,
      })

      return {
        success: true,
        username,
        email,
        passwordSent: true,
      }
    } catch (mailError) {
      return {
        success: true,
        username,
        email,
        passwordSent: false,
        message: `User imported but email sending failed: ${mailError.message}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      username,
      email,
      message: error.message,
    }
  }
}

router.get("/", checkLogin,
  checkRole("ADMIN", "MODERATOR"), async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
      .populate({
        'path': 'role',
        'select': "name"
      })
    res.send(users);
  });

router.get("/:id", checkLogin, async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/", postUserValidator, validateResult,
  async function (req, res, next) {
    let session = await mongoose.startSession()
    session.startTransaction()
    try {
      let newItem = await userController.CreateAnUser(
        req.body.username,
        req.body.password,
        req.body.email,
        req.body.role,
        session
      )
      let newCart = new cartModel({
        user: newItem._id
      })
      let result = await newCart.save({ session })
      result = await result.populate('user')
      await session.commitTransaction();
      await session.endSession()
      res.send(result)
    } catch (err) {
      await session.abortTransaction()
      await session.endSession()
      res.status(400).send({ message: err.message });
    }
  });

router.post('/import', checkLogin, checkRole("ADMIN", "MODERATOR"), uploadExcel.single('file'), async function (req, res, next) {
  if (!req.file) {
    res.status(400).send({ message: 'Vui long upload file Excel .xlsx voi field name la file' });
    return;
  }

  const pathFile = path.join(__dirname, '../uploads', req.file.filename);

  try {
    const userRole = await roleModel.findOne({
      name: { $regex: /^user$/i },
      isDeleted: false,
    });

    if (!userRole) {
      res.status(400).send({ message: 'Khong tim thay role user trong he thong' });
      return;
    }

    const workbook = new excelJS.Workbook();
    await workbook.xlsx.readFile(pathFile);
    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 2) {
      res.status(400).send({ message: 'File khong co du lieu de import' });
      return;
    }

    const existingUsers = await userModel.find({ isDeleted: false }).select('username email');
    const existingUsernames = new Set(existingUsers.map((user) => user.username));
    const existingEmails = new Set(existingUsers.map((user) => `${user.email}`.toLowerCase()));
    const importedUsernames = new Set();
    const importedEmails = new Set();
    const results = [];

    for (let index = 2; index <= worksheet.rowCount; index++) {
      const row = worksheet.getRow(index);
      const username = getCellText(row, 1);
      const email = getCellText(row, 2).toLowerCase();
      const errors = [];

      if (!username) {
        errors.push('username khong duoc rong');
      }

      if (!email) {
        errors.push('email khong duoc rong');
      } else if (!/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('email khong dung dinh dang');
      }

      if (existingUsernames.has(username) || importedUsernames.has(username)) {
        errors.push('username da ton tai');
      }

      if (existingEmails.has(email) || importedEmails.has(email)) {
        errors.push('email da ton tai');
      }

      if (errors.length > 0) {
        results.push({
          row: index,
          success: false,
          username,
          email,
          errors,
        });
        continue;
      }

      const importResult = await importSingleUser({
        username,
        email,
        roleId: userRole._id,
        roleName: userRole.name,
      });

      if (importResult.success) {
        existingUsernames.add(username);
        existingEmails.add(email);
        importedUsernames.add(username);
        importedEmails.add(email);
      }

      results.push({
        row: index,
        ...importResult,
      });
    }

    const successCount = results.filter((item) => item.success).length;
    const failureCount = results.length - successCount;

    res.send({
      message: 'Import user completed',
      totalRows: Math.max(worksheet.rowCount - 1, 0),
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  } finally {
    if (fs.existsSync(pathFile)) {
      fs.unlinkSync(pathFile);
    }
  }
});

router.put("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findById(id);
    for (const key of Object.keys(req.body)) {
      updatedItem[key] = req.body[key];
    }
    await updatedItem.save();

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
